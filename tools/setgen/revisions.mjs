// Which sheets have been reissued, and what changed each time.
//
// A revision is a handful of localized edits to an otherwise identical sheet —
// a wall added, a room renamed, a door moved. That is what a reissue looks like
// in practice, and it is what change-region detection has to find: a few small
// differences on a sheet that is otherwise the same down to the pixel.
//
// Edits are cumulative. Revision 3 carries revision 2's edits plus its own, so a
// diff between 2 and 3 finds only what 3 changed. Each revision's edits come
// from a generator seeded for that revision alone, so adding a revision never
// moves the edits of an earlier one.

import { hashString, mulberry32 } from "./rng.mjs";

// The share of sheets reissued at least once. Around sixty in a 1,500-sheet
// set: enough to give every discipline something to compare, few enough that a
// superseded sheet is still the exception in the index.
const REVISED_SHARE = 0.04;

// Of the reissued sheets, the share reissued twice.
const SECOND_REISSUE_SHARE = 1 / 3;

export const EDIT_KINDS = ["partition", "hatch", "rename", "door"];

// The latest revision of a sheet. Decided per sheet from its own id, like
// everything else in the set, so it does not depend on `--count`.
export function latestRevision(seed, sheetId) {
  const rng = mulberry32(hashString(`${seed}:${sheetId}:revised`));
  if (rng() >= REVISED_SHARE) return 1;
  return rng() < SECOND_REISSUE_SHARE ? 3 : 2;
}

// The edits a sheet carries at `revision`, oldest first. `room` is a fraction
// rather than an index because the number of rooms is only known once the plan
// is subdivided; the drawing code turns it into a room.
export function revisionEdits(seed, sheetId, revision) {
  const edits = [];
  for (let r = 2; r <= revision; r += 1) {
    const rng = mulberry32(hashString(`${seed}:${sheetId}:r${r}`));
    const count = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i += 1) {
      edits.push({
        revision: r,
        kind: EDIT_KINDS[Math.floor(rng() * EDIT_KINDS.length)],
        room: rng(),
        // Where along the room the edit lands, and a value for whichever
        // property it changes. Drawn for every kind so the stream does not
        // depend on which kind was picked.
        at: rng(),
        value: rng(),
      });
    }
  }
  return edits;
}

// Where a revision's files live. Revision 1 keeps the paths the set has always
// had, so every number measured against it still describes the same bytes.
export function sheetFile(sheetId, revision) {
  return revision === 1
    ? `sheets/${sheetId}.pdf`
    : `sheets/${sheetId}.r${revision}.pdf`;
}
