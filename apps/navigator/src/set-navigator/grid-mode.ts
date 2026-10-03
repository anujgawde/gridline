import type { GridMode } from "./types";

/* Which grid the page draws, read from `?grid=`.

   Virtual by default; the full grid, every card in the DOM, stays reachable at
   `?grid=full`. It is the baseline the virtual grid is measured against, and
   keeping it a URL rather than a commit means that comparison can be re-run,
   and that a scroll gate can be shown to fail against it. An unrecognised value
   falls back rather than failing. */
export function gridMode(search = window.location.search): GridMode {
  return new URLSearchParams(search).get("grid") === "full" ? "full" : "virtual";
}
