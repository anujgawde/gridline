import { SheetGrid } from "./sheet-grid";
import { SheetPanel } from "./sheet-panel";
import type { SetNavigatorProps } from "./types";

/* Imported inside the exposed module, not the standalone entry: the shell never
   loads this app's entry, so a stylesheet imported there would be missing. */
import "@gridline/platform/ui.css";
import "./set-navigator.css";

export function SetNavigator({ layout }: SetNavigatorProps) {
  return layout === "grid" ? <SheetGrid /> : <SheetPanel />;
}
