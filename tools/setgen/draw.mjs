// How a sheet is drawn. Every layer is a function over (page, ctx, rng), so the
// content of a sheet is a composition rather than one long routine.
//
// The target is density, not beauty. A sheet with a handful of lines on it
// rasterizes instantly and would make the rendering budgets meaningless, so each
// sheet carries a few thousand vector operations — the order of magnitude a real
// large-format drawing puts through a rasterizer.

import { StandardFonts, rgb } from "pdf-lib";

import { floatBetween, intBetween, pick } from "./rng.mjs";

// ARCH E1, 30 x 42 inches at 72 points per inch, landscape. The large-format
// sheet the whole project is about — a size that does not fit a screen at any
// readable zoom, which is what makes tiling necessary rather than decorative.
export const PAGE = { width: 3024, height: 2160 };

const MARGIN = 36;
const TITLE_BLOCK_WIDTH = 468;
const INK = rgb(0.1, 0.1, 0.12);
const LIGHT = rgb(0.55, 0.57, 0.6);
const HAIRLINE = 0.5;
const THIN = 1;
const HEAVY = 2;

const ROOM_NAMES = [
  "OFFICE", "CORRIDOR", "STORAGE", "MECH", "ELEC", "STAIR", "LOBBY",
  "CONFERENCE", "TOILET", "JANITOR", "VESTIBULE", "PANTRY", "SERVER",
  "RECEPTION", "OPEN OFFICE", "SHAFT",
];

function drawingArea() {
  return {
    x: MARGIN,
    y: MARGIN,
    width: PAGE.width - MARGIN * 2 - TITLE_BLOCK_WIDTH,
    height: PAGE.height - MARGIN * 2,
  };
}

function line(page, x1, y1, x2, y2, thickness, color) {
  page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness,
    color,
  });
}

// --- layers ----------------------------------------------------------------

// An explicit white page. A PDF with no background is transparent, and what that
// rasterizes to is the renderer's choice — white in one, black in another. The
// tiler rasterizes every one of these, so the page says what colour it is.
function pageBackground(page) {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE.width,
    height: PAGE.height,
    color: rgb(1, 1, 1),
  });
}

function sheetBorder(page) {
  page.drawRectangle({
    x: MARGIN / 2,
    y: MARGIN / 2,
    width: PAGE.width - MARGIN,
    height: PAGE.height - MARGIN,
    borderWidth: HEAVY,
    borderColor: INK,
  });
}

function titleBlock(page, ctx) {
  const { fonts, sheet } = ctx;
  const x = PAGE.width - MARGIN - TITLE_BLOCK_WIDTH;
  const top = PAGE.height - MARGIN;

  page.drawRectangle({
    x,
    y: MARGIN,
    width: TITLE_BLOCK_WIDTH,
    height: PAGE.height - MARGIN * 2,
    borderWidth: THIN,
    borderColor: INK,
  });

  // Stacked cells down the block, the way a real title block is ruled.
  const rows = [176, 132, 96, 72, 72, 120];
  let y = top;
  for (const height of rows) {
    y -= height;
    line(page, x, y, x + TITLE_BLOCK_WIDTH, y, HAIRLINE, INK);
  }

  page.drawText("GRIDLINE", {
    x: x + 20,
    y: top - 52,
    size: 30,
    font: fonts.bold,
    color: INK,
  });
  page.drawText("CONSTRUCTION DOCUMENTS", {
    x: x + 20,
    y: top - 80,
    size: 11,
    font: fonts.regular,
    color: LIGHT,
  });

  const lines = [
    ["SHEET TITLE", sheet.title],
    ["DISCIPLINE", sheet.disciplineName.toUpperCase()],
    ["REVISION", String(sheet.revision).padStart(2, "0")],
    ["SCALE", ctx.scale],
  ];
  let ly = top - 210;
  for (const [label, value] of lines) {
    page.drawText(label, {
      x: x + 20,
      y: ly,
      size: 8,
      font: fonts.regular,
      color: LIGHT,
    });
    page.drawText(value, {
      x: x + 20,
      y: ly - 20,
      size: 14,
      font: fonts.bold,
      color: INK,
    });
    ly -= 44;
  }

  // The sheet number, set large in the bottom cell.
  const size = 44;
  const width = fonts.bold.widthOfTextAtSize(sheet.sheetId, size);
  page.drawText(sheet.sheetId, {
    x: x + TITLE_BLOCK_WIDTH - 20 - width,
    y: MARGIN + 44,
    size,
    font: fonts.bold,
    color: INK,
  });
}

function columnGrid(page, ctx) {
  const area = drawingArea();
  const { fonts } = ctx;
  const cols = ctx.grid.cols;
  const rows = ctx.grid.rows;
  const stepX = area.width / (cols + 1);
  const stepY = area.height / (rows + 1);
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // I and O are skipped on drawings

  for (let c = 1; c <= cols; c += 1) {
    const x = area.x + stepX * c;
    line(page, x, area.y, x, area.y + area.height, HAIRLINE, LIGHT);
    const label = letters[(c - 1) % letters.length];
    for (const y of [area.y + area.height - 8, area.y + 8]) {
      page.drawCircle({ x, y, size: 16, borderWidth: THIN, borderColor: INK });
      const w = fonts.bold.widthOfTextAtSize(label, 12);
      page.drawText(label, { x: x - w / 2, y: y - 4, size: 12, font: fonts.bold, color: INK });
    }
  }

  for (let r = 1; r <= rows; r += 1) {
    const y = area.y + stepY * r;
    line(page, area.x, y, area.x + area.width, y, HAIRLINE, LIGHT);
    const label = String(r);
    for (const x of [area.x + 8, area.x + area.width - 8]) {
      page.drawCircle({ x, y, size: 16, borderWidth: THIN, borderColor: INK });
      const w = fonts.bold.widthOfTextAtSize(label, 12);
      page.drawText(label, { x: x - w / 2, y: y - 4, size: 12, font: fonts.bold, color: INK });
    }
  }
}

// Guillotine subdivision — split a rectangle, then split the halves. Produces
// room layouts that partition the floor plate without overlapping, which is what
// a plan actually looks like; random rectangles look like noise.
function subdivide(rect, depth, rng) {
  if (depth === 0 || (rect.width < 240 && rect.height < 240)) return [rect];
  const horizontal = rect.width < rect.height;
  const ratio = floatBetween(rng, 0.35, 0.65);
  const a = horizontal
    ? { ...rect, height: rect.height * ratio }
    : { ...rect, width: rect.width * ratio };
  const b = horizontal
    ? { ...rect, y: rect.y + rect.height * ratio, height: rect.height * (1 - ratio) }
    : { ...rect, x: rect.x + rect.width * ratio, width: rect.width * (1 - ratio) };
  return [...subdivide(a, depth - 1, rng), ...subdivide(b, depth - 1, rng)];
}

// 45-degree hatching clipped to a rectangle by solving for the entry and exit
// points rather than relying on a clip path, so the output stays a flat list of
// line segments — which is the thing being rasterized.
// pdf-lib has no arc primitive, so the swing is a short polyline. It also adds
// the kind of many-small-segments geometry a real drawing is full of, which is
// exactly what a rasterizer has to chew through.
function quarterArc(page, cx, cy, radius, segments = 10) {
  let px = cx + radius;
  let py = cy;
  for (let i = 1; i <= segments; i += 1) {
    const angle = (Math.PI / 2) * (i / segments);
    const nx = cx + Math.cos(angle) * radius;
    const ny = cy + Math.sin(angle) * radius;
    line(page, px, py, nx, ny, HAIRLINE, LIGHT);
    px = nx;
    py = ny;
  }
}

function hatch(page, rect, spacing) {
  const inset = 6;
  const x0 = rect.x + inset;
  const y0 = rect.y + inset;
  const x1 = rect.x + rect.width - inset;
  const y1 = rect.y + rect.height - inset;
  if (x1 <= x0 || y1 <= y0) return;

  // For the line y = x - c, x is bounded by the rectangle's own sides and by
  // where that line crosses its top and bottom edges. Solving for x and deriving
  // y from it keeps both endpoints on the line; taking each axis independently
  // does not. The offset c sweeps from x0 - y1 (the line grazing the top-left
  // corner) to x1 - y0 (the bottom-right) — anything narrower leaves part of the
  // rectangle unhatched, which reads as a wedge.
  for (let c = x0 - y1; c < x1 - y0; c += spacing) {
    const sx = Math.max(x0, y0 + c);
    const ex = Math.min(x1, y1 + c);
    if (ex > sx) line(page, sx, sx - c, ex, ex - c, HAIRLINE, LIGHT);
  }
}

function rooms(page, ctx, rng) {
  const area = drawingArea();
  const plate = {
    x: area.x + area.width * 0.06,
    y: area.y + area.height * 0.06,
    width: area.width * 0.88,
    height: area.height * 0.88,
  };

  const cells = subdivide(plate, ctx.grid.depth, rng);
  const edited = assignEdits(ctx.edits, cells);
  const { fonts } = ctx;

  cells.forEach((cell, i) => {
    const wall = 5;
    // Walls are drawn as two lines with a cavity, as a plan draws them.
    page.drawRectangle({
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
      borderWidth: HEAVY,
      borderColor: INK,
    });
    page.drawRectangle({
      x: cell.x + wall,
      y: cell.y + wall,
      width: Math.max(cell.width - wall * 2, 1),
      height: Math.max(cell.height - wall * 2, 1),
      borderWidth: HAIRLINE,
      borderColor: INK,
    });

    // Every draw from the sheet's generator happens here, in the same order
    // whether or not the room is revised. A revision changes what is drawn,
    // never how much randomness was consumed, so every other room on the sheet
    // comes out identical.
    const room = {
      // Roughly a third of rooms are hatched — a floor finish or a shaft.
      hatched: rng() < 0.34,
      spacing: 0,
      name: "",
      door: false,
      doorAt: 0,
      partition: null,
    };
    if (room.hatched) room.spacing = intBetween(rng, 7, 12);
    room.name = pick(rng, ROOM_NAMES);
    // Door swings on most rooms: the leaf, plus a quarter arc for the swing.
    room.door = rng() < 0.7 && cell.width > 100 && cell.height > 80;
    if (room.door) room.doorAt = floatBetween(rng, 0.25, 0.65);

    for (const edit of edited.get(i) ?? []) applyEdit(room, edit);

    if (room.hatched) hatch(page, cell, room.spacing);

    const number = `${ctx.level}${String(i + 1).padStart(2, "0")}`;
    if (cell.width > 120 && cell.height > 60) {
      const nameWidth = fonts.bold.widthOfTextAtSize(room.name, 11);
      const cx = cell.x + cell.width / 2;
      const cy = cell.y + cell.height / 2;
      page.drawText(room.name, { x: cx - nameWidth / 2, y: cy + 4, size: 11, font: fonts.bold, color: INK });
      const numWidth = fonts.regular.widthOfTextAtSize(number, 9);
      page.drawText(number, { x: cx - numWidth / 2, y: cy - 12, size: 9, font: fonts.regular, color: LIGHT });
    }

    if (room.door) {
      const swing = Math.min(32, cell.width / 4, cell.height / 3);
      const dx = cell.x + room.doorAt * cell.width;
      line(page, dx, cell.y, dx, cell.y + swing, THIN, INK);
      quarterArc(page, dx, cell.y, swing);
    }

    if (room.partition !== null) partition(page, cell, room.partition);
  });

  return cells;
}

// --- revisions -------------------------------------------------------------

// Rooms large enough that every kind of edit shows: the name is drawn and a
// door fits. An edit to a room too small to label would change nothing visible.
function editable(cell) {
  return cell.width > 120 && cell.height > 80;
}

// Turns each edit's fractional `room` into a room on this sheet, one edit per
// room. Two edits landing on the same room could cancel out — a hatch toggled
// twice is no change at all — so a collision moves on to the next free room.
function assignEdits(edits, cells) {
  const byRoom = new Map();
  if (edits.length === 0) return byRoom;

  let candidates = cells.flatMap((cell, i) => (editable(cell) ? [i] : []));
  if (candidates.length === 0) candidates = cells.map((_, i) => i);

  for (const edit of edits) {
    const first = Math.floor(edit.room * candidates.length);
    // More edits than rooms: stack on the room the edit first chose.
    let index = candidates[first];
    for (let step = 0; step < candidates.length; step += 1) {
      const next = candidates[(first + step) % candidates.length];
      if (!byRoom.has(next)) {
        index = next;
        break;
      }
    }
    byRoom.set(index, [...(byRoom.get(index) ?? []), edit]);
  }
  return byRoom;
}

function applyEdit(room, edit) {
  switch (edit.kind) {
    case "hatch":
      room.hatched = !room.hatched;
      if (room.hatched && room.spacing === 0) {
        room.spacing = 7 + Math.floor(edit.value * 6);
      }
      break;
    case "rename": {
      // An offset of at least one, so the new name is never the old one.
      const at = ROOM_NAMES.indexOf(room.name);
      const step = 1 + Math.floor(edit.value * (ROOM_NAMES.length - 1));
      room.name = ROOM_NAMES[(at + step) % ROOM_NAMES.length];
      break;
    }
    case "door":
      // A door that exists moves by a fifth of the wall; one that does not is
      // added. Either way the change is a visible distance, not a nudge.
      if (room.door) {
        room.doorAt += room.doorAt < 0.45 ? 0.2 : -0.2;
      } else {
        room.door = true;
        room.doorAt = 0.25 + edit.value * 0.4;
      }
      break;
    case "partition":
      // Kept clear of the middle third, where the room's name is set.
      room.partition =
        edit.at < 0.5 ? 0.2 + edit.at * 0.3 : 0.5 + edit.at * 0.3;
      break;
    default:
      throw new Error(`unknown revision edit ${edit.kind}`);
  }
}

// A new wall across the room's shorter span, drawn as the plan draws walls: two
// lines with a cavity between them.
function partition(page, cell, at) {
  const wall = 5;
  if (cell.width >= cell.height) {
    const x = cell.x + cell.width * at;
    line(page, x, cell.y + wall, x, cell.y + cell.height - wall, THIN, INK);
    line(page, x + wall, cell.y + wall, x + wall, cell.y + cell.height - wall, THIN, INK);
  } else {
    const y = cell.y + cell.height * at;
    line(page, cell.x + wall, y, cell.x + cell.width - wall, y, THIN, INK);
    line(page, cell.x + wall, y + wall, cell.x + cell.width - wall, y + wall, THIN, INK);
  }
}

// Dimension strings along the top and left of the plate — tick marks plus the
// measurement, in feet and inches, as a set is dimensioned.
function dimensions(page, ctx, cells) {
  const { fonts } = ctx;
  const xs = [...new Set(cells.map((c) => Math.round(c.x)))].sort((a, b) => a - b);
  const area = drawingArea();
  const y = area.y + area.height * 0.96;

  line(page, xs[0], y, xs[xs.length - 1], y, HAIRLINE, INK);
  for (let i = 0; i < xs.length; i += 1) {
    line(page, xs[i], y - 8, xs[i], y + 8, HAIRLINE, INK);
    if (i === 0) continue;
    const span = xs[i] - xs[i - 1];
    // 1/8 inch = 1 foot, so a point is 1/6 of a foot at this scale.
    const feet = Math.round(span / 6);
    const label = `${Math.floor(feet / 12)}'-${feet % 12}"`;
    const w = fonts.regular.widthOfTextAtSize(label, 9);
    page.drawText(label, {
      x: (xs[i] + xs[i - 1]) / 2 - w / 2,
      y: y + 12,
      size: 9,
      font: fonts.regular,
      color: INK,
    });
  }
}

// --- entry -----------------------------------------------------------------

export async function embedFonts(doc) {
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
}

// `edits` are the revision's changes, from `revisionEdits`. Revision 1 has
// none, and draws exactly what it drew before revisions existed.
export function drawSheet(page, sheet, fonts, rng, edits = []) {
  const ctx = {
    sheet,
    fonts,
    edits,
    level: intBetween(rng, 1, 9),
    scale: pick(rng, ['1/8" = 1\'-0"', '1/4" = 1\'-0"', '3/16" = 1\'-0"']),
    grid: {
      cols: intBetween(rng, 9, 15),
      rows: intBetween(rng, 6, 10),
      depth: intBetween(rng, 4, 6),
    },
  };

  pageBackground(page);
  sheetBorder(page);
  columnGrid(page, ctx);
  const cells = rooms(page, ctx, rng);
  dimensions(page, ctx, cells);
  titleBlock(page, ctx);
}
