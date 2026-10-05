import { useEffect, useState } from "react";

import { loadLatestRevision, loadSheetSource } from "../sources";

/* How many revisions a sheet has, or null while unknown. Unknown is not an
   error: the pickers fall back to plain labels and the comparison still
   draws. */
export function useLatestRevision(sheetId: string) {
  const [latest, setLatest] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setLatest(null);
    loadSheetSource()
      .then((source) => loadLatestRevision(source, sheetId))
      .then(
        (revision) => live && setLatest(revision),
        (error: unknown) => console.error("[compare] sheet index unavailable", error),
      );
    return () => {
      live = false;
    };
  }, [sheetId]);

  return latest;
}
