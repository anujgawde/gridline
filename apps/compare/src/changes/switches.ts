/* Diagnostic switches, not features. Each exists so a perf gate can be seen
   to fail: `?detect=main` runs detection on the page's thread instead of the
   worker, and `?detectLevel=3` diffs four times the pixels. */

export function detectOnMainThread(search = window.location.search): boolean {
  return new URLSearchParams(search).get("detect") === "main";
}

/* The tile level to diff, or null for the default. */
export function detectLevelOverride(search = window.location.search): number | null {
  const level = Number(new URLSearchParams(search).get("detectLevel"));
  return Number.isInteger(level) && level > 0 ? level : null;
}
