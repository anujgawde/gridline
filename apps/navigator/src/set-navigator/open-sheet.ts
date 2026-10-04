import { bus } from "@gridline/platform/bus";

/* Asks for a sheet over the bus. The navigator does not know who opens it —
   the viewer changes sheet, and the shell shows the drawing if it was showing
   the grid. */
export function openSheet(sheetId: string) {
  bus.publish("sheet:open", { sheetId, source: "navigator" });
}
