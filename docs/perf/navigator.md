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
to prove the spec can see a regression, and it does:

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

**Before:** every sheet rendered as a DOM card. **After:** virtualised — to be
measured.

| metric | before | after |
|---|---|---|
| DOM elements | 7559 | |
| JS heap | 8 MB | |
| frames drawn | 941 (941–942) | |
| frame median | 17 ms (17–17) | |
| frame p95 | 18 ms (18–18) | |
| frame worst | 40 ms (35–41) | |
| frames > 25 ms | 1 (1–1) | |
| main-thread rendering | 1565 ms (1315–1604) | |

### What the "before" shows

The unoptimised grid does not stutter visibly at 4x: frames arrive at display
rate and one frame in a full scroll runs long. Its cost is elsewhere — 7,559
elements resident for the life of the page, and about 1.6 s of main-thread
rendering work over a 15-second scroll.

That frames the comparison. A virtualised grid renders cards as they scroll
into view, which is main-thread work of its own, so its main-thread time is not
expected to fall and may rise. Its case rests on DOM size and memory, with frame
pacing held where it is.

**Worst frame is noisy.** Separate sessions on the same machine have read 22–50
ms. A gate on it must be set from the worst reading, not the median.

## Reproduce

```sh
pnpm build && pnpm serve           # in one terminal
pnpm exec playwright test navigator
PERF_JANK=1 PERF_RUNS=1 pnpm exec playwright test navigator   # the control
```

Results are written to `perf-results/navigator-scroll.json`, and the control to
`perf-results/navigator-scroll-jank.json`.
