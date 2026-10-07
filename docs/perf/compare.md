# Compare — opening a comparison and finding its changes

What it costs to open two revisions of a sheet side by side, how long change
detection takes and whether it blocks the page, how panning paces in both
modes, and whether detection finds every edit in the set.

Every figure here comes from `tests/perf/compare.spec.ts` or
`tests/perf/compare-coverage.spec.ts`, run on one machine. The spec is the
source of truth: no number enters this file that did not come out of a run
anyone can repeat.

## Profile

**4x CPU throttle**, a 1600 × 1000 viewport, the shell at
`?view=compare&sheet=…&from=1&to=3`. Every response is paced by the static
server over one shared link: 1.6 Mbit/s with a 562 ms round trip. Three runs
over four comparisons, A-131, M-622, AD-229 and M-555, each from REV 1 to
REV 3. The last three carry six edits each, the most in the set.

## How it is measured

Each comparison is opened twice in one browser context: **cold**, then
reloaded, so the second open is served from the HTTP cache. Set content is
served `immutable`, so warm is the work without the network.

The spans are compare's own:

- **Both revisions shown** (`gridline:compare-shown`): from the comparison
  being asked for to every level-0 tile of both revisions on screen, ended
  after the frame that draws them has painted.
- **Changes found** (`gridline:changes-found`): from asking for detection to
  the regions arriving. It covers starting the worker, fetching both
  revisions' level-2 tiles, decoding them, reading the pixels back and
  diffing them.
- **Longest task while detecting**: long tasks on the page's thread that
  began inside the changes-found span. Shell start-up is outside it.

Panning is a 60-step circle over the TO pane on A-131, after the warm open:
side by side, then in onion skin. Frames are recorded as intervals between
animation frames.

## Readings

Median with the range in brackets. Open readings are n=12, pans n=3.

| | cold | warm |
|---|---|---|
| Both revisions shown | 2877 ms (2670–3123) | 1223 ms (1220–1242) |
| Changes found | 4846 ms (4431–5641) | 787 ms (785–807) |
| Longest task while detecting | **0 ms** (0–0) | **0 ms** (0–0) |

| Pan | frame p95 | worst frame |
|---|---|---|
| Side by side | 18 ms (18–18) | 32 ms (23–33) |
| Onion skin | 25 ms (24–26) | 27 ms (26–34) |

A-131 is the slowest of the four to detect cold in every run, at about
5.6 s against 4.4–5.0 s.

**Detection never blocks the page.** No open, cold or warm, produced a long
task during detection. The diff runs in a worker.

**Cold detection is mostly the network.** Warm, the same detection takes
787 ms; the difference is downloading both revisions' tiles.

**Onion skin is the heavier draw.** Each frame tints two layers and blends
them, and its p95 is 7 ms above side by side's.

## The controls

A gate is only trusted once it has been seen to fail, so each one is broken
on purpose by a switch. These are diagnostic, not features: they make the
app worse in a known way. One run each (n=4 opens, n=1 pan).

| Switch | What it does | Reading under it | Normal |
|---|---|---|---|
| `?detect=main` (`PERF_DETECT=main`) | runs detection on the page's thread | longest task while detecting **106 ms** cold, **111 ms** warm | 0 ms |
| | | both revisions shown, cold **6028 ms** | 2877 ms |
| `?detectLevel=3` (`PERF_DETECT_LEVEL=3`) | diffs level 3: four times the pixels | changes found, cold **12722 ms** | 4846 ms |
| | | changes found, warm **990 ms** | 787 ms |
| `PERF_JANK=1` (spec only) | stalls the page 80 ms on every pointer move | pan p95 **98 ms** side by side and onion | 18 / 25 ms |

### What the controls show beyond the gates

**The worker costs about half a second and is worth it.** On the page's
thread, warm detection finished in 298 ms (290–322) against the worker's
787 ms. The difference is starting the worker: its chunk carries the Module
Federation runtime, which the bundler adds to every entry, and at 4x CPU
parsing it dominates. In exchange, the page never blocks, and the drawing
is not held back: with detection on the page's thread, both revisions
appeared three seconds later.

**Level 3 is not worth its cost.** Four times the pixels costs about 200 ms
warm and eight seconds cold, while level 2 already passes the coverage check
below, so the extra pixels buy nothing it measures. Level 3 also split some
edits into more regions: 9 and 10 on M-622 and AD-229, against 8.

## Coverage — no edit missed

`compare-coverage.spec.ts` opens every reissue in the set against the
revision before it, 64 comparisons over 51 sheets, and checks that **every
level-3 tile whose bytes differ between the two is touched by a detected
region**. A reissue leaves unchanged areas byte-identical, so a differing
tile is where an edit is. The check needs nothing from the generator's own
record of what it edited, which compare never sees either.

**64 of 64 pass.** Between 2 and 10 tiles changed per comparison, boxed by
2 to 5 regions, so the check is not passed by boxing whole sheets. Extra
regions are not failures: the title block's revision field changes on every
reissue and is always found.

## Gates

`COMPARE_BUDGETS` in `tests/perf/budgets.ts`: each a reading above plus 25%
headroom, or from the worst reading where the spread is as wide as the
headroom, and each seen to fail under one of the controls. Warm "both
revisions shown" is recorded but not gated, because no control moves it.

The worst single frame of a pan is not gated: it moved between 23 and 33 ms
across identical runs.
