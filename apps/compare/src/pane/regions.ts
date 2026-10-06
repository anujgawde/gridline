import type { ChangeRegion } from "../changes";
import type { View } from "../view";

import type { RegionStyle } from "./types";

/* A canvas cannot read `var()`, so the colours are taken from the tokens once.
   Boxes sit on the drawing, so they use the sheet's colours, which never
   theme; only the selection takes the accent. */
export function regionStyle(el: HTMLElement): RegionStyle {
  const css = getComputedStyle(el);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    paper: token("--sheet-paper"),
    ink: token("--sheet-ink"),
    stroke: token("--sheet-ink-soft"),
    accent: token("--border-accent"),
    onAccent: token("--text-on-accent"),
    font: token("--font-data"),
  };
}

/* Each change as a dashed box with its number in a tag on the top-left
   corner, after the mockup. Drawn in CSS pixels rather than sheet space, so
   lines and numbers stay the same size at any zoom. The selected one is
   drawn last, so it is never under another. */
export function drawRegions(
  ctx: CanvasRenderingContext2D,
  regions: ChangeRegion[],
  selectedId: number | null,
  view: View,
  dpr: number,
  style: RegionStyle,
) {
  const ordered = [...regions.filter((r) => r.id !== selectedId), ...regions.filter((r) => r.id === selectedId)];
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const { id, rect } of ordered) {
    const x = (rect.x - view.x) * view.scale;
    const y = (rect.y - view.y) * view.scale;
    const width = rect.width * view.scale;
    const height = rect.height * view.scale;
    const selected = id === selectedId;
    const tag = selected ? { width: 26, height: 20 } : { width: 24, height: 18 };

    if (selected) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = style.accent;
      ctx.fillRect(x, y, width, height);
      ctx.globalAlpha = 1;
    }
    ctx.setLineDash(selected ? [] : [7, 5]);
    ctx.lineWidth = selected ? 2.5 : 1.4;
    ctx.strokeStyle = selected ? style.accent : style.stroke;
    ctx.strokeRect(x, y, width, height);

    ctx.setLineDash([]);
    ctx.fillStyle = selected ? style.accent : style.paper;
    ctx.fillRect(x, y - tag.height, tag.width, tag.height);
    if (!selected) {
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x, y - tag.height, tag.width, tag.height);
    }
    ctx.fillStyle = selected ? style.onAccent : style.ink;
    ctx.font = `${selected ? 700 : 600} 13px ${style.font}`;
    ctx.fillText(String(id), x + tag.width / 2, y - tag.height / 2);
  }

  ctx.restore();
}
