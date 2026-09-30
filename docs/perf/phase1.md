# Phase 1 — viewer rendering, before and after

The starting numbers for sheet rendering, and what they became.

Everything here is measured on one machine with a committed spec, and the spec is
the source of truth: no figure enters this file that did not come out of a run
anyone can repeat.

## Profile

**4x CPU throttle, Fast 3G** — the mid-tier tablet profile, applied over the
Chrome DevTools Protocol by `tests/perf/throttle.ts`. Every number below is taken
under it. A figure without its profile is not a figure; the same code is quick on
a laptop and slow in a gloved hand on a site, and only one of those is the claim.

| | |
|---|---|
| Machine | Apple M1 Pro, 8 cores, macOS 26.2 |
| Chromium | 153.0.8010.12 (Playwright 1.63.0) |
| Sheet set | 1,500 sheets, seed `gridline-v1`, set checksum `b95b5f46…` |

## Reproducing

```bash
pnpm setgen          # once — writes data/sets/v1
pnpm build
pnpm serve           # shell 4100, viewer 4101, sheet set 4200
pnpm perf            # in a second terminal
```

Each figure is a **median of 5 cold runs**, each in a fresh browser context so
the HTTP cache is genuinely empty. The spread is reported beside it, because a
throttled run is noisy and a single sample is an anecdote rather than a
measurement. `PERF_RUNS=9 pnpm perf` takes more; `PERF_SHEET=S-204 pnpm perf`
checks the reading is not an artefact of one sheet.

Measured against the static server, never `pnpm dev`. A dev server rebuilds,
injects hot-reload code and applies headers that do not exist in a deployed
build, so a number taken from it is a number about the bundler.

Each run writes `test-results/phase1-baseline.json`.

## The two renderers

Both stay in the app permanently, selected by `?renderer=`, so the comparison is
a URL rather than a commit someone has to check out.

- **`fullpage`** — pdf.js parses on the main thread, the whole sheet is
  rasterized in one pass at 4000px wide. What you write before you know the
  document is too big for it.
- **`tiled`** — not built yet. Pre-rendered tile pyramid, level-of-detail
  selection, pdf.js confined to a worker for deep zoom.

## Results

Median of 5, with the range in brackets.

| Budget | Target | `fullpage` | `tiled` |
|---|---|---|---|
| Sheet first paint — cold | ≤ 1500 ms | **5940 ms** (5922–6454) | |
| Main-thread block during sheet load | ≤ 50 ms total | **252 ms** (245–267) | |
| Longest single task during load | — | 107 ms (105–116) | |
| Peak heap, one sheet | — | 9 MB | |

Both budgets are missed: first paint by **4.0x**, main-thread block by **5.0x**.

### Where the cold time actually goes

No budget names these, but without them the headline number cannot be explained.
The cold path is a chain — shell bundle, then the remote lookup, then the remote,
then its chunks, then the sheet — and each stage only discovers the next.

| | `fullpage` | `tiled` |
|---|---|---|
| Shell first contentful paint (before any remote is involved) | 2964 ms (2944–3192) | |
| Fetching the pdf.js library (`pdfjsLoad`) | 2275 ms (2271–2298) | |
| Parsing the sheet, library already in memory (`sheetParse`) | 23 ms (22–24) | |
| Rasterizing the page to pixels (`sheetRaster`) | 169 ms (167–187) | |

The viewer's total share of the cold load (`sheetFirstPaint`) is 2472 ms, which is
those last three added together — a useful check that nothing unaccounted for is
hiding between them.

These three replace a single `sheetParse` figure taken earlier, which spanned the
library download as well as the parse and so attributed bundle cost to parsing.
The reading was retaken after splitting them.

`tiled` stays empty until step 1.4 exists. The `fullpage` column is taken once,
before any optimisation lands — it is the one reading that cannot be recovered
later, because once tiles and the worker exist the slow path is no longer what
runs and nobody rebuilds it to get a "before".

## Budgets not yet measurable

These rows from `buildplan.md` §7 need behaviour that does not exist yet. They
are listed so the gaps are visible rather than quietly absent.

| Budget | Blocked on |
|---|---|
| Sustained pan/zoom ≥ 55 fps, no frame > 50 ms | The gesture layer — there is nothing to pan yet |
| Pinch-zoom input-to-paint ≤ 32 ms | Same |
| Sheet first paint — warm (IndexedDB hit) | Phase 2's persistent tile cache |
| Tile cache hit rate ≥ 80% | Phase 2's cache and its counters |
| Peak heap across 50 sheets | In-app sheet switching; today a sheet change is a page load, so nothing accumulates across a session |
| `remoteEntry.js` ≤ 15 KB gzip, shell bundle ≤ 120 KB gzip | Nothing — add to the spec when the budgets become gates in 1.6 |

## Reading the baseline

**Rasterizing the whole sheet costs 169 ms. Shipping the library that does it
costs 2275 ms.** The operation Phase 1 exists to optimise is, on a cold load, the
cheapest part of it by a factor of thirteen.

The cold path is a dependency chain, and each link only discovers the next: the
shell's bundle, then `remotes.json`, then the viewer's manifest and entry, then
the viewer's chunks, then pdf.js, then the sheet. At Fast 3G's 562 ms round trip
the shape of that chain costs more than any single thing in it. The sheet itself
transfers in 4 ms.

Two consequences worth stating before the tiled renderer lands, so the after
column is read honestly:

**Tiles will remove pdf.js from the cold path entirely**, because a tile is an
image. That is worth roughly 2.3 seconds and has nothing to do with tiling being
a better way to rasterize. Any before/after on `coldSheetOnCanvas` is mostly
measuring that, and saying so is the difference between a result and a sales
pitch.

**The rasterization win is not visible here.** One sheet, painted once, is the
best case for a full-page raster. What breaks it is panning and zooming across a
large document — decoding pixels the screen cannot show, and holding sheets in
memory. Those are the fps and heap rows, and they stay unmeasurable until the
gesture layer exists in 1.5.

**`mainThreadBlocked` at 252 ms is the one number that already carries the
thesis.** It is main-thread work during a load where parsing happens on the main
thread by construction. When pdf.js moves into a worker in 1.4, this is the
before it gets compared against, and it is measured the same way on both sides.
