// Merges the generated sheets into one document.
//
// This is the artifact a real drawing set actually is. Jurisdictions accept
// submittals up to 500 MB and only allow splitting by discipline above 100 MB,
// so what reaches a superintendent is one file with every sheet in it — not a
// folder of them. Handing the naive renderer 1,500 separate files would give it
// a decomposition it did not earn, and the comparison against tiles would be
// measuring a head start rather than a technique.
//
// Page order is sheet-number order, the order a set is bound in.

import { PDFDocument } from "pdf-lib";

const EPOCH = new Date(0);

export async function combineSheets(sheets, loadBytes, onProgress) {
  const out = await PDFDocument.create();

  out.setTitle("Gridline — Tower B Permit Set");
  out.setAuthor("Gridline");
  out.setSubject("Construction Documents");
  out.setProducer("gridline-setgen");
  out.setCreator("gridline-setgen");
  out.setCreationDate(EPOCH);
  out.setModificationDate(EPOCH);

  const ordered = [...sheets].sort((a, b) => a.sheetId.localeCompare(b.sheetId));
  const index = [];

  for (let i = 0; i < ordered.length; i += 1) {
    const sheet = ordered[i];
    const source = await PDFDocument.load(await loadBytes(sheet));
    const [page] = await out.copyPages(source, [0]);
    out.addPage(page);

    // A sheet number is not a page number, and the gap is the whole reason a
    // set needs a navigator: asking for A-101 means nothing to a PDF reader.
    index.push({
      sheetId: sheet.sheetId,
      title: sheet.title,
      discipline: sheet.discipline,
      pageNumber: i + 1,
    });

    if (onProgress && (i + 1) % 100 === 0) onProgress(i + 1, ordered.length);
  }

  return { bytes: await out.save({ useObjectStreams: false }), index };
}
