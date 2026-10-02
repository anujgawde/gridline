# Viewer — rendering and interaction, before and after

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

Each run writes `test-results/viewer-baseline-<renderer>.json`.

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
| Sheet change, first ten (median) | 210 ms (174–224930) | 1320 ms (1307–7960) |
| Sheet change, last ten (median) | 224 ms (181–251) | 1306 ms (1298–1327) |
| **Returning to a visited sheet** | not measured | **98 ms** (72–104) |
| Worst frame, first ten | 25 ms (23–35) † | 29 ms (27–30) |
| Worst frame, last ten | 24 ms (22–27) † | 28 ms (27–29) |
| Memory at sheet 1 | 59.9 MB | 13.5 MB |
| **Memory peak** | **2230 MB** (2180 MB canvas) | **171 MB** (160 MB tiles) |
| Memory passes 400 MB at | **sheet 9** | never |
| Sheets painted of 50 | 50 / 50 | 50 / 50 |

† The `fullpage` frame rows were taken before the shared gesture layer landed
and have not been re-run. Every other `fullpage` figure here is driven by the
42 MB transfer, main-thread parsing, or retained pages — none of which the input
layer or the panel touches — so those stand. The `tiled` column was re-taken in
full afterwards.

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
| Main-thread block on load | 1120 ms → 66 ms, **17x less** |
| Longest single task | 875 ms → 66 ms, **13x shorter** |
| Peak memory over 50 sheets | 2230 MB → 171 MB, **13x less** |
| Sheet change | 210 ms → 1306 ms, **6x slower** |
| Returning to a visited sheet | — → 98 ms |

**The slower sheet change is real and is the honest cost.** Naive is quick between
sheets because it already paid for all of them; every page is in memory. Tiled
fetches what it needs per sheet, so it pays a little each time instead of
everything once. 225 seconds of nothing versus 1.3 seconds per sheet is a trade,
not a free win, and a session of more than about 170 sheets would spend more time
waiting under tiled than under naive.

**Returning to a sheet costs 98 ms**, and that figure is a median across two
populations rather than one number. The tile index is memoized either way, but a
sheet whose coarse tiles are still held repaints from memory in about 72 ms, while
one past the cache's pinned ceiling refetches them and decodes, at about 104 ms.
The refetch is cheap because set content is served `immutable`, so it comes from
the browser's cache rather than the network — the gap between 104 ms and a fresh
sheet change at 1306 ms is the whole measure of how much that header is doing.
The row does not exist for naive, where a revisit is simply a cache hit in RAM.

**The memory curve is flat, and that is measured rather than argued.** A
140-sheet run of the same script climbs 5 MB a sheet to sheet 32, then holds at
exactly 160 MB — the cache's pinned budget — for the remaining 107 sheets. Peak
was 173 MB at sheet 140 against 171 MB at sheet 50, with every sheet painted. The
claim is "flat", not "slower growth": memory is bounded by the budget rather than
by how many sheets someone opens.

It took a 140-sheet run to establish that, and the first one failed. An earlier
build exempted the coarse levels from the budget outright, on the reasoning that
the whole set's coarse tiles were worth a few megabytes — true of their encoded
size, and wrong by 77x for the decoded bitmaps actually held. Measured, that grew
to 711 MB over 140 sheets with eviction never running once, because at fit scale
every tile the renderer needs is a coarse one. The exemption now has a ceiling of
its own, evicted by least-recently-used sheet, and the plateau above is the
result. A budget with an unbounded exemption is not a budget, and the only reason
this was caught is that the session samples process memory from outside the cache
— the cache's own byte total could not see what it had failed to account for.

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
- **`tiled`** — tiles from a pyramid built offline by `tools/tiler`, the level
  chosen from the current scale, held in a byte-budgeted cache. Deep zoom past
  the deepest pre-rendered level is not wired up; the renderer reports
  `data-needs-deep` where it would be used.

## Cold start

Getting from a tapped link to the first drawing on screen. Median of 3 runs,
range in brackets, each run in a fresh browser context so the cache is empty.

| Measurement | `fullpage` | `tiled` |
|---|---|---|
| Document open (42 MB over the link) | 217.7 s | — never opened |
| **First sheet on screen** | **225.5 s** | **8.46 s** (8449–8569) |
| Rasterizing one page | 278 ms (276–305) | — no PDF in the browser |
| Main-thread block during load | 1120 ms (1037–1190) | **66 ms** (63–158) |
| Longest single task | 875 ms (872–879) | **66 ms** (63–93) |
| Shell chrome on screen (before any remote) | 3976 ms (3972–4068) | 3968 ms (3964–4112) |
| Viewer's own share of the cold load | — | 1239 ms (1235–1248) |
| JS heap after first sheet | 21 MB | 8 MB |

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

Two things to keep in mind reading the `tiled` column, so the comparison is read
honestly:

**Tiles remove pdf.js from the cold path entirely**, because a tile is an image.
That saving is a bundle change, not evidence that tiling is a better way to
rasterize. Saying so is the difference between a result and a sales pitch.

**Main-thread block is the number that carries the rendering thesis.** It is
main-thread work during a load where, for `fullpage`, parsing happens on the main
thread by construction. Both columns are measured the same way.


## Interaction

Taken with `tests/perf/interaction.spec.ts` at 4x CPU and 1.6 Mbit/s, median of
five runs, on a sheet that has already finished loading. `tiled` only — the
gesture layer is shared by both renderers, so measuring it twice would measure
the same code.

Three scenarios, because one gesture does not answer one question. `pan` never
changes the scale, so no tile is ever requested and it is the input path alone.
`zoomSteady` swings a pinch in and out inside one band of scale, where the tiles
are already decoded. `zoomDeepening` grows a pinch the whole way into levels that
have not been fetched — what someone does to read a detail.

| | `pan` | `zoomSteady` | `zoomDeepening` |
|---|---|---|---|
| Input to paint, event timing median | 40 ms | **32 ms** | 64 ms |
| Input to paint, event timing p95 | 40 ms | 64 ms | 64 ms |
| Input to paint, settle median | — | 60 ms | 100 ms |
| Input to paint, settle p95 | — | 75 ms | 118 ms |
| Frame interval p95 | 26 ms | 33 ms | 52 ms |
| Worst frame interval | 27 ms | 36 ms | **54 ms** |
| Main thread blocked | **0 ms** | **0 ms** | 358 ms |
| Longest single task | 0 ms | 0 ms | 54 ms |

**The gesture layer costs nothing measurable; fetching new detail costs
everything.** Panning and zooming inside cached scale block the main thread for
0 ms across the whole gesture, and no frame exceeds 36 ms. The moment a pinch
crosses into levels that have not been fetched, blocking goes to 358 ms, the
worst frame crosses the 50 ms long-task line, and input to paint roughly doubles.
Every interaction cost in this app is tile work, not input handling.

**Against the three budgets.** Input to paint is 32 ms at the median when the
tiles are there, which is exactly the budget and nothing to spare; it is 64 ms
when they are not. Frame intervals miss 16.7 ms in every scenario — 26 ms at p95
while panning is about 38 frames a second, not 60. The 50 ms long-task line is
met everywhere except `zoomDeepening`, which exceeds it at 54 ms.

So: responsive while it has what it needs, and visibly not while it is fetching.
That is the same shape as the sheet-change cost in the session table, and it has
the same cause.

### Two things to know before reading these numbers

**Input to paint is measured two ways and they disagree, deliberately.** Event
timing is the Event Timing API, which is what INP is built from and what reports
the span from the event's own timestamp to the next paint. It rounds durations to
8 ms, so against a 32 ms budget it has four buckets — every figure in those rows
is a multiple of 8 because of that, not because the app is quantised. The settle
rows are finer and pair each input with the moment the renderer's reported scale
changes in the DOM, which is past paint and includes a React render. Settle
therefore over-states and event timing under-resolves; the real figure is between
them, and both are recorded so that is visible rather than hidden inside one
chosen number.

**The input rate is the harness's, not a device's.** Playwright dispatches each
move over a round trip, so these describe how the app responds to a stream of
events rather than what a particular tablet's digitiser would deliver. Frame
gaps are unaffected — the recorder's own loop runs independently — but the
gesture durations are not a device measurement.

## Budgets

Three, and only three. Each is a physical fact about displays and attention, not
a preference:

| Budget | Value | Why it is not arbitrary |
|---|---|---|
| Long task | 50 ms | The definition of a Long Task |
| Frame | 16.7 ms | One frame at 60 Hz — what "smooth" physically means |
| Input to paint | 32 ms | Two frames, where input stops feeling connected to response |

Those three are what "good" means. They are references, not gates, and this app
does not meet all of them: frame intervals miss 16.7 ms in every scenario, and
input to paint only reaches 32 ms when the tiles it needs are already decoded.
Both are recorded above rather than rounded away.

**The gates are a separate thing, and they are in `tests/perf/budgets.ts`.** Each
is a measurement from this machine plus 25% headroom, so a real regression trips
it and an ordinary noisy run does not. They run against `tiled` only; `fullpage`
ships permanently so the comparison stays a URL anyone can open, and it fails all
of them by construction, which is what it is for.

The distinction matters because a gate set from measurement is green the day it
is written. **A passing gate is not evidence this app is fast** — it is evidence
nothing got worse. The claim that it performs well is made by the before/after
tables above, which come from a different source and a different argument.

Two gates are not derived that way. Where the measurement was zero, a multiplier
yields zero and any single long task would fail the run, so those use an absolute
50 ms — the definition of a long task, and the only line in the file that is a
physical fact rather than an observation.

The 400 MB figure in the session table remains a marker on the memory curve
rather than the pass mark; the memory gate is 216 MB, from the 173 MB measured
over 140 sheets. It was 324 MB, derived from a 259 MB reading taken while memory
was still climbing without bound — a reminder that a gate is only as sound as the
behaviour it was calibrated against, and that reading was honest about a system
that was not.

The revisit gate is 130 ms rather than 25% over the 98 ms median, because revisit
is bimodal: ~72 ms inside the pinned ceiling, ~104 ms past it. The spec samples
three sheets without knowing which side they fall on, so its median moves with the
draw, and a gate has to clear the slower population.

## To be measured

| What | Status |
|---|---|
| Pinch-zoom input to paint | Measured — see Interaction above |
| Zoom image quality past rasterized resolution | Not started |
| Warm start from a persistent cache | Needs the persistent tile cache |
| Tile cache hit rate | Needs the in-app counters that expose it |
| Bundle size per remote | Not started |
| Slow 3G and LTE connection profiles | Not started |
