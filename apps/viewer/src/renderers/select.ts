import type { RendererName } from "./types";

const RENDERERS: RendererName[] = ["fullpage"];

/* Which renderer the page is running, read from `?renderer=`.

   The switch exists so the before/after comparison is a URL anyone can open
   rather than a commit anyone has to check out. An unrecognised value falls back
   rather than failing — a mistyped query string should not blank the viewer. */
export function selectRenderer(search = window.location.search): RendererName {
  const requested = new URLSearchParams(search).get("renderer");
  return RENDERERS.includes(requested as RendererName)
    ? (requested as RendererName)
    : "fullpage";
}
