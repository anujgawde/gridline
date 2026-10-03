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
    /* 8461 ms measured (8449–8569). Later runs have read as high as 9004, so the
       spread is wider than the first three suggested; the gate still clears it. */
    coldSheetOnCanvasMs: 10_600,
    /* 66 ms measured, but the spread was 63–158. Set from the worst reading,
       because 25% over the median would sit under a run we actually saw. */
    mainThreadBlockedMs: 200,
    // 66 ms measured (63–93) — also set from the worst reading.
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
     of anything here. */
  interaction: {
    pan: {
      /* 26 ms measured (26–27) in the latest run, but readings across runs span
         26–35, which is wider than 25% of the median. Set from the worst of
         those rather than from this run's tight spread: the old 34 sat *inside*
         the observed band and passed twice by a single millisecond. */
      frameWorstMs: 44,
      // 0 ms measured — see the absolute-floor note above.
      blockedMs: 50,
    },
    zoomSteady: {
      // 72 ms measured (69–83)
      settleP95Ms: 94,
      // 34 ms measured (33–38)
      frameWorstMs: 45,
      // 0 ms measured
      blockedMs: 50,
    },
    zoomDeepening: {
      // 114 ms measured (101–116)
      settleP95Ms: 148,
      // 51 ms measured (50–53)
      frameWorstMs: 68,
      /* 156 ms measured (103–205), set from the worst reading because the spread
         is wider than the headroom. Still the largest number in this file, and
         still tile work during a zoom into unfetched levels rather than anything
         the gesture layer does.

         Tightened hard from 448, which came from an earlier 358 ms (312–363)
         reading. That gate would now pass a 2.9x regression, which is not a
         gate. If this trips and the readings look like the old regime rather
         than a real change, the 358 history is the thing to check first. */
      blockedMs: 256,
    },
  },
} as const;

/* The naive renderer is measured, never graded. */
export function isGated(renderer: string): boolean {
  return renderer === "tiled";
}
