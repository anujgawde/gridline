// Rasterizes one PDF page into the tiles of one pyramid level.
//
// Runs in Node, never in a browser. This is the work the naive renderer does on
// the client every time a sheet is opened; doing it once here is the entire
// point of a pyramid.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

import { TILE } from "./pyramid.mjs";

const require_ = createRequire(import.meta.url);

/* pdf.js needs the standard font files on disk to draw text with the base-14
   fonts. Without it every string is silently dropped — the render succeeds, the
   page looks right at a glance, and all the text is missing. It wants a
   filesystem path, not a file:// URL. */
const STANDARD_FONTS =
  join(dirname(require_.resolve("pdfjs-dist/package.json")), "standard_fonts") +
  "/";

export async function openSheet(path) {
  return pdfjs.getDocument({ url: path, standardFontDataUrl: STANDARD_FONTS })
    .promise;
}

/* One level, rendered once and then cut up. Rendering per tile would re-run the
   whole page for every square, which at 48 tiles a level is 48x the work. */
export async function renderLevel(page, level, quality) {
  const base = page.getViewport({ scale: 1 });
  const canvas = createCanvas(level.width, level.height);
  const context = canvas.getContext("2d");

  /* The page declares its own white background, but a tile that falls outside
     the page still has to be opaque white rather than transparent — otherwise
     what the viewer composites depends on what is underneath it. */
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, level.width, level.height);

  await page.render({
    canvas,
    canvasContext: context,
    viewport: page.getViewport({ scale: level.width / base.width }),
  }).promise;

  const tiles = [];
  for (let row = 0; row < level.rows; row += 1) {
    for (let col = 0; col < level.cols; col += 1) {
      const tile = createCanvas(TILE, TILE);
      const tileContext = tile.getContext("2d");
      tileContext.fillStyle = "#ffffff";
      tileContext.fillRect(0, 0, TILE, TILE);
      tileContext.drawImage(
        canvas,
        col * TILE,
        row * TILE,
        TILE,
        TILE,
        0,
        0,
        TILE,
        TILE,
      );
      tiles.push({
        col,
        row,
        bytes: tile.toBuffer("image/webp", quality),
      });
    }
  }

  return tiles;
}
