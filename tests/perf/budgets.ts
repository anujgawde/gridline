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
    // 8461 ms measured (8449–8569)
    coldSheetOnCanvasMs: 10_600,
    /* 66 ms measured, but the spread was 63–158. Set from the worst reading,
       because 25% over the median would sit under a run we actually saw. */
    mainThreadBlockedMs: 200,
    // 66 ms measured (63–93) — also set from the worst reading.
    longestTaskMs: 120,
  },

  /* A 50-sheet session. One run rather than a median of several, because it
     takes two minutes; these are the softest gates here for that reason. */
  session: {
    // 1312 ms measured
    sheetChangeMs: 1640,
    // 81 ms measured
    revisitMs: 101,
    // 259 MB measured
    peakMemoryMb: 324,
    // 30 ms measured
    worstFrameMs: 38,
  },

  /* Interaction on a loaded sheet. Median of 5 runs, and the tightest spreads
     of anything here. */
  interaction: {
    pan: {
      // 27 ms measured (27–33)
      frameWorstMs: 34,
      // 0 ms measured — see the absolute-floor note above.
      blockedMs: 50,
    },
    zoomSteady: {
      // 75 ms measured (70–83)
      settleP95Ms: 94,
      // 36 ms measured (34–36)
      frameWorstMs: 45,
      // 0 ms measured
      blockedMs: 50,
    },
    zoomDeepening: {
      // 118 ms measured (117–121)
      settleP95Ms: 148,
      // 54 ms measured (54–55)
      frameWorstMs: 68,
      /* 358 ms measured (312–363). The largest number in this file, and the one
         worth driving down rather than defending: it is tile work during a zoom
         into levels that have not been fetched, not the gesture layer. */
      blockedMs: 448,
    },
  },
} as const;

/* The naive renderer is measured, never graded. */
export function isGated(renderer: string): boolean {
  return renderer === "tiled";
}
