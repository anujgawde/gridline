# Navigator — the sheet grid and its thumbnails

What it costs to scroll the whole 1,500-sheet set, what it became, what
thumbnails add to it, and what a discipline filter costs.

Every figure here comes from `tests/perf/navigator.spec.ts`,
`tests/perf/thumbnails.spec.ts` or `tests/perf/filters.spec.ts`, run on one
machine.
The spec is the source of truth: no number enters this file that did not come
out of a run anyone can repeat.

## Profile

**4x CPU throttle**, a 1600 × 1000 viewport, median of three runs with the range
in brackets. The grid readings do not touch the network: the sheet list has
finished loading before measurement starts, and thumbnails are switched off
(`?thumbs=0`) so nothing downloads underneath them. Thumbnails are fetched over
the same paced link as every other spec: 1.6 Mbit/s with a 562 ms round trip,
shared by every request in flight to that server.

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

## Thumbnails

Each card shows its sheet's level-0 tile: the whole sheet in one 512 px image,
median 22 KB, already produced by the tiler for the viewer. A card requests its
thumbnail when it comes on screen and withdraws the request if it leaves first.
Requests are served newest first, four at a time, so after a fling the cards
someone has stopped on are not queued behind ones already gone.

The navigator keeps no thumbnail cache of its own. Tiles are served immutable,
so the browser's HTTP cache already holds every one fetched; **scroll back**
below is the reading that tests whether that is enough.

**First screenful** runs from the grid painted to every on-screen card showing
its thumbnail. **Slow scroll** is four screens at 400 px/s, a reading pace at
which thumbnails arrive and decode mid-scroll — a fast scroll withdraws most
requests before anything decodes, so it cannot answer whether decoding costs
frames. The spec counts the thumbnails that arrived during it, and a run in
which none did fails. Off is the same walk with `?thumbs=0`.

Both columns were taken in one session, one run after the other, with four
thumbnail requests in flight at a time.

| metric | thumbnails off | thumbnails on |
|---|---|---|
| first screenful | — | 5871 ms (5848–5894) |
| scroll back, screen filled | — | 161 ms (153–228) |
| JS heap | 7 MB | 9 MB |
| thumbnails arrived during slow scroll | 0 | 47 (43–47) |
| slow scroll: frame median | 17 ms (17–17) | 17 ms (17–17) |
| slow scroll: frame p95 | 17 ms (17–18) | 17 ms (17–17) |
| slow scroll: frame worst | 41 ms (27–51) | 43 ms (39–44) |
| slow scroll: frames > 25 ms | 1 (1–1) | 1 (1–1) |
| slow scroll: main-thread rendering | 352 ms (330–361) | 459 ms (444–485) |

### What thumbnails cost

**Scrolling holds its frame rate while they decode.** Median, p95 and long
frames are identical with and without them, and the worst frame sits inside the
noise both arms show. Decoding is not free — main-thread time rises by about
107 ms over a scroll in which 47 arrived, roughly 2 ms each, and the two ranges
do not overlap — but none of it reaches a dropped frame.

**A screenful takes 5.9 seconds, and most of it is waiting.** 28 thumbnails of
about 22 KB is roughly 600 KB, which a 1.6 Mbit/s link carries in about 3
seconds; with one 562 ms round trip ahead of it, about 3.6 seconds is the floor
for images of this size. The rest is round trips that do not overlap: with four
requests in flight, each waits a full round trip before its first byte.

**The navigator needs no cache of its own.** Returning to cards already seen
refills the screen in 161 ms, from the browser's HTTP cache.

## Filters

One toggle per discipline hides or shows its sheets. A filter hands the grid
fewer discipline groups and nothing else, so it should cost a new row layout
and the rows now on screen — not a card per sheet. The spec checks that.

**Filter applied** runs from the click event's own timestamp to the frame
showing the regrouped grid painted, so input delay is in it. Each run hides
and re-shows every discipline in turn, fourteen toggles, and every toggle is a
sample. **Grid shown** from the same runs is beside it for scale: a filter
costing more than the grid's first draw would be doing more than handing it
fewer rows. Thumbnails are off.

The full grid is the control. There a filter re-renders every card left in
the set, so a spec that read the same on both could not see what a filter
costs.

Both columns were taken in one session, one run after the other; 42 toggles
each.

| metric | virtual grid | full grid (control) |
|---|---|---|
| grid shown, for scale | 66 ms (66–85) | 227 ms (226–261) |
| filter applied, median | 17 ms | 69 ms |
| filter applied, p95 | 56 ms | 119 ms |
| filter applied, worst | 79 ms | 150 ms |
| longest task while toggling | 0 ms | 83 ms (82–98) |

### What a filter costs

**About one frame.** A toggle on the virtual grid reads a median of 17 ms,
which is one display frame at 60 Hz — the span ends after the next paint, so
it cannot read much lower. No toggle produced a long task. The full grid takes
four times as long and blocks the main thread for over 80 ms, which is the
cost the virtual grid avoids by drawing only the rows on screen.

**The first toggle of every run is the slowest**, on both grids: 56–79 ms on
the virtual grid, against 16–20 ms for the other thirteen. Those three are
the whole of the p95 and the worst. The spec always hides the same discipline
first, so it cannot tell whether that is the page's first interaction or
something about that discipline; a gate on the worst toggle has to allow for
it either way.

## Scroll main-thread time across the navigator's steps

Scrolling the virtual grid end to end read 1399 ms of main-thread rendering when
it was first built and about 1950 ms once the navigator was finished. Frames did
not move: p95 is 17–18 ms at every step. To find where the time came from, the
grid was built at each step from a clean checkout and measured back to back in
one session, so a difference between sessions cannot pass for a difference
between steps.

| after | DOM nodes | main-thread rendering, median of 3 |
|---|---|---|
| virtual grid | 264 | 1499 ms (1468–1516) |
| thumbnails, switched off | 264 | 1612 ms (1596–1629) |
| discipline filters | 308 | 1670 ms (1654–1685) |
| click to open, side panel, keyboard | 344 | 1949 ms (1932–1956) |

**Opening sheets from the grid added the most, about 280 ms over a 15-second
scroll.** That step turned each card into a button and gave the grid a tab stop
and a key handler. Removing the cards' hover border did not recover it, and the
cause is not pinned down.

**This figure moves between sessions with no change to the code.** The same
build read 2256–2394 ms in one session and 1889–2429 in another, which is why
its gate is set from the worst reading and why steps are compared only within
one session.

**Main-thread time is not what virtualisation saves.** With every row drawn,
the same scroll read 1342 ms: a grid that never re-renders does less work while
scrolling than one that adds and removes rows as they pass. What virtualisation
saves is the DOM and the first render, and those are the gates that catch it
being lost.

## Gates

In `tests/perf/budgets.ts` as `NAVIGATOR_BUDGETS`, asserted by
`navigator.spec.ts` and `filters.spec.ts` on the virtual grid. Each is a
measurement plus 25%, or the worst reading plus 25% where runs spread wider than
that.

| gate | measured | budget |
|---|---|---|
| DOM nodes | 344 | 430 |
| Grid shown | 71 ms (71–86; 89 in another session) | 111 ms |
| Longest task while loading | 76 ms (68–79) | 95 ms |
| Scroll frame p95 | 17 ms (17–18) | 23 ms |
| Frames over 25 ms while scrolling | 1 (0–1) | 2 |
| Scroll main-thread rendering | 2288 ms (2256–2394; 1889–2429 in another session) | 3040 ms |
| Filter applied, median | 18 ms (14–74, 42 toggles) | 23 ms |
| Filter applied, slowest toggle | 74 ms | 99 ms |
| Longest task while filtering | 0 ms | 50 ms, the long-task line |

**Each was seen to fail.** With the overscan raised until the grid drew every
row, one run of each spec read:

| | broken | budget |
|---|---|---|
| DOM nodes | 7829 | 430 |
| Grid shown | 292 ms | 111 ms |
| Longest task while loading | 152 ms | 95 ms |
| Filter applied, median | 78 ms | 23 ms |
| Filter applied, slowest | 147 ms | 99 ms |
| Longest task while filtering | 132 ms | 50 ms |

The scroll gates stayed green, which is the point of the section above: a grid
drawing everything scrolls as smoothly and with less main-thread work. What the
scroll main-thread gate catches is work added to scrolling: under the jank
control described earlier it read 14996 ms against a 3040 ms budget. Frame p95
and long frames did not move enough there to trip theirs — the compositor keeps
scrolling smooth through a busy main thread — so they guard against a change
that reaches the frames themselves, and have not been seen to fail.

## Reproduce

```sh
pnpm build && pnpm serve           # in one terminal
pnpm exec playwright test navigator                    # after: the virtual grid
PERF_GRID=full pnpm exec playwright test navigator     # before: every card
PERF_JANK=1 PERF_RUNS=1 pnpm exec playwright test navigator   # the control
pnpm exec playwright test thumbnails                   # thumbnails on
PERF_THUMBS=0 pnpm exec playwright test thumbnails     # thumbnails off
pnpm exec playwright test filters                      # filters, virtual grid
PERF_GRID=full pnpm exec playwright test filters       # filters, the control
```

Each grid writes its own file, `perf-results/navigator-scroll-virtual.json` and
`perf-results/navigator-scroll-full.json`; a control run adds `-jank` to the
name. Thumbnails write `perf-results/navigator-thumbnails-on.json` and
`-off.json`; filters write `perf-results/navigator-filters-virtual.json` and
`-full.json`.
