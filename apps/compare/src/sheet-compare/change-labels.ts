import type { ChangeKind, ChangeRegion } from "../changes";
import type { Rect, Size } from "../view";

/* Pixels say where ink changed, not what it was, so a row names the kind of
   change rather than inventing a description. */
const TITLES: Record<ChangeKind, string> = {
  added: "Linework added",
  removed: "Linework removed",
  modified: "Linework changed",
};

export function changeTitle(kind: ChangeKind) {
  return TITLES[kind];
}

/* Where on the sheet, by thirds of the page. A grid reference would be better,
   but the grid is drawn as pixels and its layout is not in the tile index. */
export function placeOf(rect: Rect, page: Size) {
  const third = (at: number, length: number) => Math.min(2, Math.floor((at / length) * 3));
  const row = ["Upper", "Middle", "Lower"][third(rect.y + rect.height / 2, page.height)];
  const col = ["left", "centre", "right"][third(rect.x + rect.width / 2, page.width)];
  return row === "Middle" && col === "centre" ? "Centre" : `${row} ${col}`;
}

/* The summary's badges, most common kind of edit first; kinds with none are
   left out. */
export function kindCounts(regions: ChangeRegion[]) {
  const order: ChangeKind[] = ["modified", "added", "removed"];
  return order
    .map((kind) => ({ kind, count: regions.filter((r) => r.kind === kind).length }))
    .filter(({ count }) => count > 0);
}
