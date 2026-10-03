import type { RendererName } from "./types";

const RENDERERS: RendererName[] = ["tiled", "fullpage"];

/* Which renderer the page is running, read from `?renderer=`.

   The switch exists so the before/after comparison is a URL anyone can open
   rather than a commit anyone has to check out. An unrecognised value falls back
   rather than failing — a mistyped query string should not blank the viewer. */
export function selectRenderer(search = window.location.search): RendererName {
  const requested = new URLSearchParams(search).get("renderer");
  /* Tiled by default; fullpage stays reachable at ?renderer=fullpage so the
     before/after is a URL rather than a commit to check out. */
  return RENDERERS.includes(requested as RendererName)
    ? (requested as RendererName)
    : "tiled";
}

/* Whether neighbouring sheets are fetched ahead, read from `?prefetch=`.

   On unless explicitly disabled with `?prefetch=0`. It exists for the same
   reason `?renderer=` does: the before/after is then a URL anyone can open
   rather than a commit anyone has to check out. Prefetch is worth 1310 ms
   against ~25 ms on a sequential walk, and a claim that large should stay
   re-derivable after the commit that introduced it has scrolled out of view. */
export function prefetchEnabled(search = window.location.search): boolean {
  return new URLSearchParams(search).get("prefetch") !== "0";
}
