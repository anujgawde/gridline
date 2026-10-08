/* pdf.js's canvas factory for a page with no document.

   pdf.js asks its factory for scratch canvases (patterns, groups, masks), and
   the default one calls `document.createElement("canvas")`, which a worker
   does not have. Same contract, backed by OffscreenCanvas. */
export class OffscreenCanvasFactory {
  create(width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }

  reset(
    target: { canvas: OffscreenCanvas | null },
    width: number,
    height: number,
  ) {
    if (!target.canvas) throw new Error("Canvas is not specified");
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    target.canvas.width = width;
    target.canvas.height = height;
  }

  destroy(target: { canvas: OffscreenCanvas | null; context: unknown }) {
    if (!target.canvas) throw new Error("Canvas is not specified");
    target.canvas.width = target.canvas.height = 0;
    target.canvas = null;
    target.context = null;
  }
}
