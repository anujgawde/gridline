// One sheet, in, PDF bytes out. Separated from the CLI so the property the whole
// generator rests on — same sheet and seed, same bytes — can be asserted by a
// test without running a generation.

import { PDFDocument } from "pdf-lib";

import { drawSheet, embedFonts, PAGE } from "./draw.mjs";
import { rngForSheet } from "./rng.mjs";

// A fixed instant for every timestamp pdf-lib would otherwise take from the
// clock. Without it each run produces different bytes and a checksum describes
// nothing but when it was taken.
const EPOCH = new Date(0);

export async function renderSheet(sheet, seed) {
  const doc = await PDFDocument.create();

  doc.setTitle(`${sheet.sheetId} ${sheet.title}`);
  doc.setAuthor("Gridline");
  doc.setSubject(sheet.disciplineName);
  doc.setProducer("gridline-setgen");
  doc.setCreator("gridline-setgen");
  doc.setCreationDate(EPOCH);
  doc.setModificationDate(EPOCH);

  const fonts = await embedFonts(doc);
  const page = doc.addPage([PAGE.width, PAGE.height]);
  drawSheet(page, sheet, fonts, rngForSheet(seed, sheet.sheetId));

  return doc.save({ useObjectStreams: false });
}
