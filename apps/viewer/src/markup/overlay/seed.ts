import type { Markup, Point } from "../schema";
import type { Box } from "../types";

/* mulberry32: small, fast, and the same sequence on every run, so a reading
   taken over seeded markups can be taken again over the same ones. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uuid(rand: () => number): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

/* A sheet's worth of plausible markup: mostly short pen strokes, as on a real
   set, with boxes, clouds and the odd note among them. Diagnostic only — it
   exists so drawing and hit-testing can be measured at a known count. */
export function seededMarkups(
  sheetId: string,
  revision: number,
  page: Box,
  count: number,
  seed = 1,
): Markup[] {
  const rand = seeded(seed);
  const at = (span: number, size: number) => rand() * Math.max(1, span - size);
  const markups: Markup[] = [];

  for (let i = 0; i < count; i++) {
    const common = {
      id: uuid(rand),
      sheetId,
      revision,
      number: i + 1,
      colour: "markup-default" as const,
      strokeWidth: 2,
      author: "Seed",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const kind = rand();

    if (kind < 0.7) {
      let x = page.x + at(page.w, 200) + 100;
      let y = page.y + at(page.h, 200) + 100;
      const points: Point[] = [[x, y]];
      const steps = 3 + Math.floor(rand() * 6);
      for (let s = 0; s < steps; s++) {
        x += (rand() - 0.5) * 60;
        y += (rand() - 0.5) * 60;
        points.push([x, y]);
      }
      markups.push({ ...common, kind: "ink", points });
      continue;
    }

    const w = 20 + rand() * 160;
    const h = 20 + rand() * 100;
    const box = { x: page.x + at(page.w, w), y: page.y + at(page.h, h), w, h };

    if (kind < 0.85) markups.push({ ...common, ...box, kind: "rect" });
    else if (kind < 0.95) markups.push({ ...common, ...box, kind: "cloud" });
    else {
      const size = 10;
      const text = `Check ${i + 1}`;
      markups.push({
        ...common,
        ...box,
        kind: "text",
        text,
        size,
        w: text.length * size * 0.6,
        h: size * 1.2,
      });
    }
  }

  return markups;
}
