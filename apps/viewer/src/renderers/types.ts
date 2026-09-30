/* Named for what it does, not for how good it is. `fullpage` rasterizes the
   whole sheet in one pass on the main thread; it is the starting point the tiled
   renderer is measured against, and it stays in the app permanently so that
   comparison can be re-run rather than taken on trust. */
export type RendererName = "fullpage";

export interface SheetRendererProps {
  sheetId: string;
  url: string;
  onPainted?: () => void;
}

/* Rendering is asynchronous and allowed to fail — an unreachable sheet is a
   normal condition, not an exception to throw at the host. The state is on the
   DOM as well, so a test can wait for it without reaching into React. */
export type RenderState = "loading" | "painted" | "failed";
