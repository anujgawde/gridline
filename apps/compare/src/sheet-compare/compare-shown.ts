/* From a comparison being asked for to both revisions on screen: tile
   indexes, every level-0 tile and the frame that draws them. Read by the perf
   spec as the `gridline:compare-shown` measure, one per comparison.

   Ended as the navigator ends its grid span: a frame callback runs before
   that frame paints and a task queued from it runs after, so the measure
   closes once the tiles are actually on screen. */
const COMPARE_SHOWN = "gridline:compare-shown";

export function measureCompareShown(start: number, detail: { sheetId: string; from: number; to: number }) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      performance.measure(COMPARE_SHOWN, { start, detail });
    });
  });
}
