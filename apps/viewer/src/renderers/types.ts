/* Named for what they do, not for how good they are. Both stay in the app
   permanently, so the comparison between them is a URL anyone can open rather
   than a commit anyone has to check out. */
export type RendererName = "fullpage" | "tiled";

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface SheetRendererProps {
  /* The sheet being asked for. Changing it is a navigation, not a remount —
     a session moves between sheets without reloading, which is the only way
     anything cumulative can be measured. */
  sheetId: string;
  onPainted?: (sheetId: string) => void;
}

export type RenderState = "loading" | "painted" | "failed";

/* What the viewer's chrome can ask of whichever renderer is mounted.

   The toolbar talks to this rather than to a renderer, so the zoom buttons work
   the same against the naive renderer and the tiled one, and a button press
   goes through the same code path a pinch does. */
export interface ViewControls {
  zoomIn(): void;
  zoomOut(): void;
  /* Frames the whole sheet. Named for what the control says, not for the
     arithmetic behind it, which differs between the two renderers. */
  fit(): void;
}

/* What was just drawn, in enough detail for something else to draw over it in
   step: the view, the canvas it was drawn into, and the sheet and revision on
   it. The page size is sheet-space, in points. */
export interface ViewFrame {
  sheetId: string;
  revision: number;
  view: Viewport;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

/* Handed upward by a renderer that can be drawn over. Listeners are called
   from inside the renderer's own frame, after the tiles, so an overlay that
   draws in its listener lands in the same frame rather than one behind. */
export interface ViewSource {
  /* Null while no sheet is drawn: between sheets, or before the first. */
  current(): ViewFrame | null;
  subscribe(listener: (frame: ViewFrame) => void): () => void;
}
