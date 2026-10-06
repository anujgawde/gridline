import { TILE_SIZE, tileUrl } from "../pyramid";
import type { Pyramid, TileLevel } from "../pyramid";
import type { DetectRequest, TilePlacement } from "./types";

/* 2048px across: 12 tiles a revision. Moves to 3 if level 2 misses thin
   partitions. */
export const DETECT_LEVEL = 2;

function levelOf({ index }: Pyramid): TileLevel {
  const level = index.levels.find((l) => l.level === DETECT_LEVEL) ?? index.levels[index.levels.length - 1];
  if (!level) throw new Error("a tile index has no levels");
  return level;
}

function placements(pyramid: Pyramid, level: TileLevel): TilePlacement[] {
  const tiles: TilePlacement[] = [];
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      tiles.push({ url: tileUrl(pyramid.ref, level.level, col, row), x: col * TILE_SIZE, y: row * TILE_SIZE });
    }
  }
  return tiles;
}

/* Both revisions at one level. Pixels can only be compared one to one, so two
   revisions cut to different sizes are refused rather than resampled. */
export function detectRequest(from: Pyramid, to: Pyramid): DetectRequest {
  const a = levelOf(from);
  const b = levelOf(to);
  if (a.level !== b.level || a.width !== b.width || a.height !== b.height) {
    throw new Error(`REV ${from.ref.revision} and REV ${to.ref.revision} are not cut alike`);
  }
  return {
    image: { width: b.width, height: b.height },
    page: { width: to.index.pageWidth, height: to.index.pageHeight },
    from: placements(from, a),
    to: placements(to, b),
  };
}
