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
