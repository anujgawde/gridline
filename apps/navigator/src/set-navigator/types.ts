import type { SheetIndexEntry } from "../sources";

export type SetNavigatorLayout = "grid" | "panel";

export interface SetNavigatorProps {
  layout: SetNavigatorLayout;
}

export interface DisciplineGroup {
  discipline: string;
  name: string;
  sheets: SheetIndexEntry[];
}
