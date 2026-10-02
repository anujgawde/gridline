import type { RendererName, TileStatsSource, ViewControls } from "../renderers";
import type { SheetIndexEntry } from "../sources";

export interface SheetToolbarProps {
  /* Null until a renderer has something on screen. The zoom controls are
     disabled rather than hidden while it is — a toolbar that changes width when
     a sheet finishes loading moves the button someone is reaching for. */
  controls: ViewControls | null;
}

export interface SheetPropertiesProps {
  sheetId: string;
  revision: number;
  /* Undefined while the set index has not resolved, or for a sheet id that is
     not in it. The panel says so rather than inventing values. */
  entry: SheetIndexEntry | undefined;
  renderer: RendererName;
}

export interface CachePanelProps {
  /* Null until a renderer that has a tile cache has mounted. The naive renderer
     never provides one, so the panel reports waiting rather than zeroes. */
  source: TileStatsSource | null;
}
