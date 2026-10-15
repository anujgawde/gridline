/* The gates.

   Every number here is derived from a measurement taken on this machine, not
   chosen. The rule is the measured median plus 25% headroom: tight enough that a
   real regression trips it, loose enough that an ordinary noisy run does not.

   Why not the figures in the buildplan: those were written before any of this
   code existed. Three of its four interaction budgets are missed by the finished
   implementation, which tells you they described a hope rather than the machine.
   A gate exists to catch a change for the worse, and it can only do that from a
   known-good reading.

   What a gate is not: evidence the app is fast. A budget set from measurement is
   green the day it is written, by construction. These catch regressions. The
   claim that the app performs well is made by the before/after numbers in
   docs/perf/viewer.md, which is a different argument from a different source.

   Two exceptions to the median-plus-25% rule, both deliberate:

     - Where the measurement is zero, a multiplier yields zero and any single
       long task would fail the run. Those use an absolute 50 ms instead, which
       is the definition of a long task and the one line here that is a physical
       fact rather than an observation.
     - Where the spread between runs is wider than the headroom, the median is
       the wrong base: a gate under the worst observed run is a gate that fails
       on a good day. Those are set from the worst reading plus the same 25%, and
       are marked below.

   Only `tiled` is gated. `fullpage` ships permanently so the comparison stays a
   URL anyone can open, and it fails all of this by construction — that is what
   it is for. */

export const HEADROOM = 1.25;

export const BUDGETS = {
  /* Cold start. Median of 3 runs, 4x CPU / 1.6 Mbit/s. */
  baseline: {
    /* 9549 ms measured (8987–9577), re-taken with the navigator panel and the
       shell's rail on the page and under the shared-link throttle. Was 10 600
       from an 8461 reading taken before both; that left the worst run 10%
       clear, inside the noise. */
    coldSheetOnCanvasMs: 11_940,
    /* 134 ms measured, but the spread was 133–245. Set from the worst reading,
       because 25% over the median would sit under a run we actually saw. Was
       200, which that 245 exceeded. */
    mainThreadBlockedMs: 306,
    // 81 ms measured (68–93) — set from the worst reading.
    longestTaskMs: 120,
  },

  /* A 50-sheet session. One run rather than a median of several, because it
     takes two minutes; these are the softest gates here for that reason.

     These grade the `stride` walk only — every figure was taken from it, and a
     sequential walk is a different population rather than a better score on the
     same one. Its gate is below. */
  session: {
    /* 1809 ms measured (1806–1815 over four runs), under the shared-link
       throttle. Re-derived from 1309 when the server stopped giving each
       response its own link: a sheet's tiles download together and now split
       the rate, which is what a real connection does. */
    sheetChangeMs: 2270,
    /* 122 ms measured (88–132), set from the worst reading rather than the
       median.

       Revisit is bimodal since the pinned coarse tiles gained a ceiling. A sheet
       still inside the pinned budget repaints from memory; one past it refetches
       from the HTTP cache and decodes. The spec samples three sheets without
       knowing which side of the ceiling they fall on, so its median swings
       between the two populations depending on the draw, and a gate on that
       median has to clear the slower one.

       Raised from 130 after prefetch landed, and the cause is understood rather
       than absorbed: prefetched neighbours occupy the pinned tier alongside
       visited sheets, so a visited sheet is evicted sooner and a revisit lands
       on the slow side more often. That is prefetch's price, paid in revisit to
       buy sheet change. */
    revisitMs: 165,
    /* 181.4 MB measured on the stride walk (178.2 sequential, 180.4 with
       prefetch off) — set from the worst of the three. Was 216, derived when the
       pinned ceiling was 160 MB; it is now 170 MB plus room for the prefetched
       neighbours. */
    peakMemoryMb: 227,
    // 31 ms measured, worst reading 32 across both walks.
    worstFrameMs: 40,
  },

  /* The sequential walk — neighbouring sheets, which is how a set is read, and
     the only walk that can judge prefetch.

     Gated on the *share of fast sheet changes*, not on a median. Sheet change
     here is bimodal by construction: a prefetch hit paints in ~26 ms and a miss
     costs ~1310, so the median sits in a gap where no measurement lives and
     moves by large steps as the hit rate shifts. Worse, a median gate cannot
     catch the regression that matters — if prefetch stopped working entirely the
     median would land at ~1310, still inside any budget loose enough to tolerate
     a bad sample.

     So the gate asserts the thing the feature claims: that a useful share of
     sheet changes are served from memory. Measured 19/49 and 25/49 across two
     runs — 39% and 51% — and set a quarter below the worse of those. */
  sessionSequential: {
    fastSheetChangeMs: 300,
    minFastSheetChangePercent: 25,
  },

  /* Interaction on a loaded sheet. Median of 5 runs, and the tightest spreads
     of anything here.

     Every gate below is set from the worst reading across two sessions that
     agree — one after the navigator panel landed, one after deep zoom
     (2026-10-07) — because a gate under either session's figure would fail on
     a day already seen. The earlier, slower readings these replaced (pan frames
     at 26–35 ms, zoomDeepening blocking at 156 ms) are history, not a band to
     tolerate: nothing in either later session came near them. */
  interaction: {
    pan: {
      /* 19 ms worst across both sessions (18–19). Was 44, set from the older
         26–35 band, which would have passed a 2.3x regression. */
      frameWorstMs: 24,
      // 0 ms measured — see the absolute-floor note above.
      blockedMs: 50,
    },
    zoomSteady: {
      // 68 ms worst across both sessions (66–68). Was 94.
      settleP95Ms: 85,
      // 22 ms worst across both sessions (20–22). Was 45.
      frameWorstMs: 28,
      // 0 ms measured
      blockedMs: 50,
    },
    zoomDeepening: {
      // 67 ms worst across both sessions (63–67). Was 148.
      settleP95Ms: 84,
      // 25 ms worst across both sessions (22–25). Was 68.
      frameWorstMs: 32,
      /* 0 ms in both sessions, so the absolute floor. Was 256, from an earlier
         156 ms (103–205) reading, itself down from 358. That cost was tile work
         during a zoom into unfetched levels, not the gesture layer; if this
         trips, check whether the readings look like that old regime before
         reading it as a new regression. */
      blockedMs: 50,
    },
  },
} as const;

/* The navigator. Virtual grid only: the full grid is the measured baseline and
   fails by construction. 4x CPU, median of 3 runs. */
export const NAVIGATOR_BUDGETS = {
  grid: {
    /* 344 measured, the same every run. The gate that catches the grid no
       longer being virtualised: drawing every card is 7559. */
    domNodes: 430,
    /* 71 ms measured (71–86), and 89 in another session the same day — set
       from that worst reading. */
    gridShownMs: 111,
    // 76 ms measured (68–79).
    loadLongestTaskMs: 95,
    // 17 ms measured (17–18).
    scrollFrameP95Ms: 23,
    /* 1 measured (0–1). A count, so 25% of it rounds to nothing; one more
       long frame than ever observed. */
    scrollLongFrames: 2,
    /* 2288 ms measured (2256–2394), and 1889–2429 in a later session of the
       same build. Set from that worst reading: this figure moves by several
       hundred ms between sessions with no code change. */
    scrollMainThreadMs: 3040,
  },
  filter: {
    // 18 ms median measured over 42 toggles (14–74) — about one frame.
    appliedMs: 23,
    /* 74 ms worst measured, and 79 in 3.6's readings. Always the first
       toggle of a run. */
    worstAppliedMs: 99,
    /* 0 ms measured. The absolute long-task line, as for interaction. */
    longestTaskMs: 50,
  },
} as const;

/* Compare, from compare.spec.ts: 3 runs × 4 comparisons (A-131, M-622,
   AD-229, M-555, REV 1 → 3), 4x CPU and the shared-link throttle, taken
   2026-10-06. Pans are on A-131 only, n=3.

   Each gate was seen to fail under a switch (PERF_RUNS=1). "Warm: both
   shown" (1223 ms, 1220–1242) is recorded in docs/perf/compare.md but not
   gated: no switch moves it, and a gate nobody has seen fail is a
   decoration. */
export const COMPARE_BUDGETS = {
  open: {
    /* 2877 ms measured (2670–3123). Tripped by PERF_DETECT=main at 6028:
       detection on the page's thread holds the drawing back three seconds. */
    coldShownMs: 3600,
    /* 4846 ms measured (4431–5641). The spread is as wide as the headroom and
       A-131 is always the slowest of the four, so this is set from the worst
       reading: 25% over the median would leave A-131's own runs 7% clear.
       Tripped by PERF_DETECT_LEVEL=3 at 12722. */
    coldFoundMs: 7050,
    /* 787 ms measured (785–807). The diff itself: tiles come from the cache,
       so this is the worker starting plus its decode, readback and pass over
       the pixels. Tripped by PERF_DETECT_LEVEL=3, but only at 990: four times
       the pixels adds ~200 ms, because most of the 787 is the worker starting.
       On the page's thread the same work took 298 ms. */
    warmFoundMs: 985,
    /* 0 ms measured, every open, cold and warm. The absolute long-task line,
       graded against the worst open rather than the median: the claim is that
       detection never blocks the page, and a median would hide the one that
       did. Tripped by PERF_DETECT=main at 106 cold and 111 warm. */
    detectLongestTaskMs: 50,
  },
  pan: {
    // 18 ms measured (18–18). Tripped by PERF_JANK=1 at 98.
    sideFrameP95Ms: 23,
    /* 25 ms measured (24–26). Two layers tinted and blended every frame.
       Tripped by PERF_JANK=1 at 98. */
    onionFrameP95Ms: 31,
  },
} as const;

/* The naive renderer is measured, never graded. */
export function isGated(renderer: string): boolean {
  return renderer === "tiled";
}
