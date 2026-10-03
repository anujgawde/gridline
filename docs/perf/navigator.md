# Navigator — scrolling the sheet grid, before and after

What it costs to scroll the whole 1,500-sheet set, and what it became.

Every figure here comes from `tests/perf/navigator.spec.ts`, run on one machine.
The spec is the source of truth: no number enters this file that did not come
out of a run anyone can repeat.

## Profile

**4x CPU throttle**, a 1600 × 1000 viewport, median of three runs with the range
in brackets. The network throttle the other specs use is irrelevant here: the
sheet list has finished loading before measurement starts.

## How it is measured

The grid is scrolled top to bottom, about 47,000 px, by
`Input.synthesizeScrollGesture` at 3,000 px/s. That is Chrome's own gesture
generator, producing wheel input inside the browser at display rate. Wheel
events sent from the test one at a time are paced by the protocol round trip
instead, and the idle gaps between them read as slow frames even with no
throttling at all: 41 ms p95, unthrottled. The spec asserts the scroll reached
the bottom.

**Frames are read from a CDP trace, as `DrawFrame` events** — frames the
compositor actually drew. Two plausible alternatives are wrong:

- `BeginFrame` is the display's refresh tick, emitted whether or not a frame
  follows. It reads 16.7 ms through an injected 80 ms main-thread stall.
- `requestAnimationFrame` counting cannot see a frame the browser was too busy
  to call back for, which is the frame that matters.

**Main-thread rendering time** is recorded alongside, as the summed duration of
event dispatch, style, layout, pre-paint, paint and layerize during the scroll.
Scrolling is driven by the compositor, which keeps drawing already-painted
content while the main thread is busy, so a heavy page shows its cost here
before it shows it in dropped frames.

### The control

`PERF_JANK=1` stalls the main thread for 80 ms on every scroll event. It exists
to prove the spec can see a regression, and it does. Taken on the full grid:

| | normal | `PERF_JANK=1` (n=1) |
|---|---|---|
| frame p95 | 18 ms | 18 ms |
| frame worst | 40 ms | 147 ms |
| frames > 25 ms | 1 | 2 |
| main-thread rendering | 1565 ms | 14996 ms |

Frame p95 barely moves under a stall that large, which is the compositor doing
its job. Main-thread time moves tenfold. A jank run writes to its own results
file and never replaces the baseline.

## Results

**Before:** every sheet rendered as a DOM card, `?grid=full`. **After:** the
virtual grid, which draws only the rows near the viewport plus half a viewport
on each side. Both columns were taken in one session, one run after the other;
readings taken in different sessions are not compared here.

**Grid shown** is the navigator's own span, from the sheet index arriving to the
grid painted, so no network time is in it. **Load: longest task** is the
longest the main thread was blocked while the page loaded.

| metric | before | after |
|---|---|---|
| grid shown | 188 ms (186–190) | 73 ms (61–81) |
| load: longest task | 120 ms (119–123) | 65 ms (63–94) |
| DOM elements | 7559 | 264 |
| JS heap | 9 MB | 7 MB |
| frames drawn | 941 (941–942) | 941 (941–941) |
| frame median | 17 ms (17–17) | 17 ms (17–17) |
| frame p95 | 18 ms (17–18) | 18 ms (17–18) |
| frame worst | 37 ms (28–46) | 35 ms (35–50) |
| frames > 25 ms | 1 (1–1) | 1 (1–1) |
| main-thread rendering | 1399 ms (1371–1660) | 1520 ms (1368–1579) |

### What the "before" shows

The full grid does not stutter visibly at 4x: frames arrive at display rate and
one frame in a full scroll runs long. Its cost is elsewhere — 7,559 elements
resident for the life of the page, a 188 ms render before the list appears, and
about 1.4 s of main-thread rendering work over a 15-second scroll.

### What changed

**The page is 28 times smaller and appears 2.6 times sooner.** DOM elements fall
from 7,559 to 264, the grid is on screen in 73 ms
instead of 188, the longest block during load halves, and the heap is 2 MB
lighter.

**Frame pacing is unchanged**, which was the requirement: median and p95 are
identical, and the worst frame sits inside the noise of both.

**Main-thread time during the scroll did not move.** The virtual grid renders
rows as they arrive, which is main-thread work the full grid never does, while
having far less to style and paint; how those two split has not been measured.
The two ranges overlap almost entirely, and the same full grid has read
1315–1945 ms across sessions on this machine, so neither direction is a claim
this data supports.

**Worst frame is noisy.** Separate sessions on the same machine have read 20–51
ms, on both grids. A gate on it must be set from the worst reading, not the median.

## Reproduce

```sh
pnpm build && pnpm serve           # in one terminal
pnpm exec playwright test navigator                    # after: the virtual grid
PERF_GRID=full pnpm exec playwright test navigator     # before: every card
PERF_JANK=1 PERF_RUNS=1 pnpm exec playwright test navigator   # the control
```

Each grid writes its own file, `perf-results/navigator-scroll-virtual.json` and
`perf-results/navigator-scroll-full.json`; a control run adds `-jank` to the
name.
