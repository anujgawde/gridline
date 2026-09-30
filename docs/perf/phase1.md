# Phase 1 — viewer rendering, before and after

The starting numbers for sheet rendering, and what they became.

Everything here is measured on one machine with a committed spec, and the spec is
the source of truth: no figure enters this file that did not come out of a run
anyone can repeat.

## Profile

**4x CPU throttle, and a link paced at 1.6 Mbit/s with a 562 ms round trip.**
Every number below is taken under it.

### The bandwidth assumption, stated plainly

1.6 Mbit/s is Chrome DevTools' "Fast 3G" preset. It was chosen because it is a
recognisable standard, **not** because anyone measured a construction site. The
headline timings are a direct consequence of it:

```
1.6 Mbit/s  =  1.6 x 1024 x 1024 / 8  =  209,715 bytes/s  ~=  205 KB/s

combined.pdf  41.7 MB  /  205 KB/s   ~=  209 s
measured                                216 s
```

There is no mystery in the number: it is the file size divided by a rate we
picked. At 20 Mbit/s the same file is about 17 seconds. So a figure like "3.8
minutes to first sheet" only means anything with the rate attached.

**What does not depend on the assumption is the shape.** The naive renderer
downloads the whole 42 MB set before showing anything, so its time scales with
the size of the document. A tiled renderer downloads only the tiles on screen,
so its time scales with the size of the screen. That ratio holds at any
bandwidth, and it is the claim worth making.

### Other connection profiles — to be filled in

Recorded at Fast 3G first. Other profiles are left open deliberately rather than
guessed at, so no single assumption carries the result.

| Profile | Rate | Document transfer, arithmetic | `fullpage` measured | `tiled` measured |
|---|---|---|---|---|
| Fast 3G (Chrome preset) | 1.6 Mbit/s | 209 s | | |
| Slow 3G (Chrome preset) | 0.4 Mbit/s | 834 s | | |
| Typical LTE | 20 Mbit/s | 17 s | | |

### How the throttle is applied

By the server, not the browser. `tools/serve.mjs --throttle` waits one round trip
then writes each response at a fixed byte rate.

This is deliberate. CDP applies network conditions per target, and a service
worker is its own target — so a throttle set on the page does not reach anything
MSW fetches, silently. That hole made an early reading report 7 seconds where the
real figure was 226. Pacing the server covers all three origins and every
requester. Every response carries `X-Gridline-Throttle` so a run can assert it
was throttled rather than assume it.

The CPU throttle stays in CDP, where it has no equivalent gap.

| | |
|---|---|
| Machine | Apple M1 Pro, 8 cores, macOS 26.2 |
| Chromium | 153.0.8010.12 (Playwright 1.63.0) |
| Sheet set | 1,500 sheets, seed `gridline-v1`, set checksum `b95b5f46…` |

## Reproducing

```bash
pnpm setgen          # once — writes data/sets/v1 including combined.pdf
pnpm build
pnpm serve           # shell 4100, viewer 4101, sheet set 4200 — all paced
pnpm perf            # in a second terminal
```

Two specs run. `baseline.spec.ts` is a cold load of one sheet.
`session.spec.ts` is the one that matters: a person moving through the set.

Each figure is a **median of 5 cold runs**, each in a fresh browser context so
the HTTP cache is genuinely empty. The spread is reported beside it, because a
throttled run is noisy and a single sample is an anecdote rather than a
measurement. `PERF_RUNS=9 pnpm perf` takes more; `PERF_SHEET=S-204 pnpm perf`
checks the reading is not an artefact of one sheet.

Measured against the static server, never `pnpm dev`. A dev server rebuilds,
injects hot-reload code and applies headers that do not exist in a deployed
build, so a number taken from it is a number about the bundler.

A cold start now includes a 42 MB transfer at 205 KB/s, so a full run takes
around twenty minutes. That is the measurement, not a problem with it.

Each run writes `test-results/phase1-baseline.json`.

## The document

The set is one PDF of 1,500 pages, 41.7 MB — which is what a drawing set *is*.
Jurisdictions accept submittals up to 500 MB and only permit splitting by
discipline above 100 MB, so what reaches someone on site is a single file.

This matters for fairness. `setgen` also writes the 1,500 sheets individually,
but those are a derived artifact that the tiler consumes — no renderer fetches
them. Handing the naive renderer pre-split sheets would give it a decomposition
it did not earn, and the comparison would be measuring a head start instead of a
technique. Both renderers are measured against the same `combined.pdf`.

Our set is pure vector at 41.7 MB. Real sets reach 100–500 MB largely because of
embedded raster scans, so these naive numbers are conservative rather than
inflated.

## The session

A cold load of one sheet is the cheapest thing this app will ever do, and no
claim worth making comes out of it. What breaks a drawing viewer is the twentieth
sheet: memory never released, frames that lengthen, a tab that stops responding.

So the headline measurement is a session — 50 sheets spread across the whole set,
each one navigated to over the bus, panned and zoomed, with memory and frame
intervals recorded throughout. The naive renderer is expected to fail it. That
failure, and the sheet number it happens at, is the result.

| Measurement | `fullpage` | `tiled` |
|---|---|---|
| Document open (1,500 pages) | 217 s | — never opened |
| First sheet on screen | 225 s | **8.45 s** |
| Sheet change, first ten (median) | 210 ms (174–224930) | 1321 ms (1301–7970) |
| Sheet change, last ten (median) | 224 ms (181–251) | 1324 ms (1301–1338) |
| **Returning to a visited sheet** | not measured | **47 ms** (40–52) |
| Worst frame, first ten | 25 ms (23–35) | 22 ms (18–34) |
| Worst frame, last ten | 24 ms (22–27) | 22 ms (20–29) |
| Memory at sheet 1 | 59.9 MB | 13.1 MB |
| **Memory peak** | **2230 MB** (2180 MB canvas) | **210 MB** (201 MB tiles) |
| Memory passes 400 MB at | **sheet 9** | never |
| Sheets painted of 50 | 50 / 50 | 50 / 50 |

### What the two renderers do differently

**The naive renderer fails twice, for unrelated reasons.** It downloads the whole
42 MB document before showing anything — 225 seconds of blank screen. And it keeps
every page it renders, so memory climbs 43.6 MB a sheet, dead linear, to 2.18 GB
over fifty. Between those two it never degrades: sheet changes and frame times are
flat from the first ten sheets to the last. It stays responsive right up until the
device stops it.

**The tiled renderer fixes both and pays for it between sheets.**

| | change |
|---|---|
| First sheet on screen | 225 s → 8.45 s, **27x faster** |
| Main-thread block on load | 1120 ms → 133 ms, **8x less** |
| Longest single task | 875 ms → 87 ms, **10x shorter** |
| Peak memory over 50 sheets | 2230 MB → 210 MB, **11x less** |
| Sheet change | 210 ms → 1321 ms, **6x slower** |
| Returning to a visited sheet | — → 47 ms |

**The slower sheet change is real and is the honest cost.** Naive is quick between
sheets because it already paid for all of them; every page is in memory. Tiled
fetches what it needs per sheet, so it pays a little each time instead of
everything once. 225 seconds of nothing versus 1.3 seconds per sheet is a trade,
not a free win, and a session of more than about 170 sheets would spend more time
waiting under tiled than under naive.

**Returning to a sheet costs 47 ms**, because nothing is fetched at all: the tile
index is memoized, the coarse levels are pinned in the cache, and set content is
served `immutable` so anything else is in the browser's cache. That row does not
exist for naive because a revisit there is simply a cache hit in RAM.

**One thing the run does not prove.** Tiled memory is still growing at about 4 MB
a sheet — 11x slower than naive, but linear. It is bounded: the cache budget is
256 MB, so eviction starts near sheet 64 and the curve should flatten there. This
session stopped at 50 and 201 MB, so **the plateau is argued rather than shown**.
A longer run is what would settle it, and until then the memory claim is "much
slower growth", not "flat".

### On measuring memory

`JSHeapUsedSize` and `performance.memory` both report only the JavaScript heap.
A canvas keeps its pixels outside that heap, so a renderer holding a gigabyte of
bitmaps looks idle to both — the first version of this spec reported 20 MB while
the app held six full-sheet canvases.

The renderer therefore reports its own pixel accounting, `width x height x 4`
summed over every canvas it holds. It is exact rather than sampled, and it is the
quantity that actually grows. The tables above are pixel memory plus JS heap.

## The two renderers

Both stay in the app permanently, selected by `?renderer=`, so the comparison is
a URL rather than a commit someone has to check out.

- **`fullpage`** — pdf.js parses on the main thread, the whole sheet is
  rasterized in one pass at 4000px wide. What you write before you know the
  document is too big for it.
- **`tiled`** — not built yet. Pre-rendered tile pyramid, level-of-detail
  selection, pdf.js confined to a worker for deep zoom.

## Cold start

Getting from a tapped link to the first drawing on screen. Median of 3 runs,
range in brackets, each run in a fresh browser context so the cache is empty.

| Measurement | `fullpage` | `tiled` |
|---|---|---|
| Document open (42 MB over the link) | 217.7 s | — never opened |
| **First sheet on screen** | **225.5 s** | **8.45 s** (8439–9017) |
| Rasterizing one page | 278 ms (276–305) | — no PDF in the browser |
| Main-thread block during load | 1120 ms (1037–1190) | **133 ms** (87–150) |
| Longest single task | 875 ms (872–879) | **87 ms** (76–87) |
| Shell chrome on screen (before any remote) | 3976 ms (3972–4068) | 4028 ms (3996–4144) |
| Viewer's own share of the cold load | — | 1235 ms (1232–1253) |
| JS heap after first sheet | 21 MB | 7 MB |

Three runs landed within 37 ms of each other (225539–225576). That is not
precision, it is a measurement dominated by a fixed transfer: 42 MB at a fixed
rate takes the same time every time, so the variance of everything else is lost
inside it.

**217.7 of the 225.5 seconds is the document arriving.** Rasterizing the page
someone actually wants takes 278 ms — one tenth of one percent of the wait.

Meanwhile the main thread is blocked for 1120 ms, with a single 875 ms task in
it, because pdf.js parses a 42 MB document on the main thread. A tab is
unresponsive for that whole task.

The cold path is a chain, and each link only discovers the next: the shell's
bundle, then `remotes.json`, then the viewer's manifest and entry, then its
chunks, then pdf.js, then the document. Nothing below can start until the thing
above it arrives, so the round trips are serial — which is the price of resolving
remotes at runtime, and the correct trade for this project, but a real one.

Two things to keep in mind when the `tiled` column is filled, so the comparison
is read honestly:

**Tiles remove pdf.js from the cold path entirely**, because a tile is an image.
That saving is a bundle change, not evidence that tiling is a better way to
rasterize. Saying so is the difference between a result and a sales pitch.

**Main-thread block is the number that carries the rendering thesis.** It is
main-thread work during a load where parsing happens on the main thread by
construction. When pdf.js moves into a worker, this is the before — measured the
same way on both sides.


## Budgets

Three, and only three. Each is a physical fact about displays and attention, not
a preference:

| Budget | Value | Why it is not arbitrary |
|---|---|---|
| Long task | 50 ms | The definition of a Long Task |
| Frame | 16.7 ms | One frame at 60 Hz — what "smooth" physically means |
| Input to paint | 32 ms | Two frames, where input stops feeling connected to response |

Everything else is recorded, not graded. Budgets come from evidence: measure the
naive implementation, build the optimised one, measure again, then set gates from
the optimised numbers with headroom. Where to put a gate is unknowable until the
code's real behaviour is known. The 400 MB figure in the session table is a
marker on the memory curve, not a pass mark.

## To be measured

| What | Status |
|---|---|
| Pinch-zoom input to paint | Blocked on the gesture layer (1.5) |
| Zoom image quality past rasterized resolution | Not started |
| Warm start from a persistent cache | Blocked on Phase 2 |
| Tile cache hit rate | Blocked on Phase 2 |
| Bundle size per remote | Not started |
| Slow 3G and LTE connection profiles | Not started |
