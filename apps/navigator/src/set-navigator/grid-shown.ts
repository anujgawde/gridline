/* The navigator's own span, from the sheet index arriving to the grid being on
   screen: React render, style, layout and the first paint, with no network in
   it. Read by the perf spec as the `gridline:grid-shown` measure. */
const INDEX_LOADED = "gridline:sheet-index-loaded";
const GRID_SHOWN = "gridline:grid-shown";

export function markIndexLoaded() {
  performance.mark(INDEX_LOADED);
}

/* Called once the grid has committed its cards. A frame callback runs before
   that frame paints, and a task queued from it runs after, so the measure ends
   once the cards are actually on screen. Only the first call counts. */
export function markGridShown() {
  requestAnimationFrame(() => {
    setTimeout(() => {
      if (performance.getEntriesByName(GRID_SHOWN, "measure").length > 0) return;
      if (performance.getEntriesByName(INDEX_LOADED, "mark").length === 0) return;
      performance.measure(GRID_SHOWN, INDEX_LOADED);
    });
  });
}

const FILTER_APPLIED = "gridline:filter-applied";

/* From a filter toggle's input event to the regrouped grid on screen, ended
   the same way as the grid-shown span. `start` is the event's own timestamp,
   so time the input waited for the main thread is in it. One measure per
   toggle, read by the perf spec as `gridline:filter-applied`. */
export function measureFilterApplied(start: number) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      performance.measure(FILTER_APPLIED, { start });
    });
  });
}
