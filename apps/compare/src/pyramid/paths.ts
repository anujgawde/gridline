import type { PyramidRef } from "./types";

/* Square tiles, as the tiler cuts them. */
export const TILE_SIZE = 512;

/* Revision 1 keeps the paths the set always had; a reissue nests under its
   sheet. The same rule the tiler writes by. */
function revisionDir({ baseUrl, sheetId, revision }: PyramidRef) {
  const root = `${baseUrl.replace(/\/$/, "")}/tiles/${sheetId}`;
  return revision === 1 ? root : `${root}/r${revision}`;
}

export function tileIndexUrl(ref: PyramidRef) {
  return `${revisionDir(ref)}/tile-index.json`;
}

export function tileUrl(ref: PyramidRef, level: number, col: number, row: number) {
  return `${revisionDir(ref)}/l${level}/${col}_${row}.webp`;
}
