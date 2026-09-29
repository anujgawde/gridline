import { Suspense, lazy, useEffect, useState } from "react";

import { bus } from "@gridline/platform/bus";

import { RemoteBoundary } from "./remote-boundary";

/* A remote that cannot be fetched rejects this promise. Left unhandled it is an
   uncaught rejection that takes the whole shell down before React renders, so
   the failure is converted into a component here. RemoteBoundary below still
   covers the other case: the remote loaded, then threw while rendering. */
const SheetSurface = lazy(() =>
  import("viewer/SheetSurface")
    .then((m) => ({ default: m.SheetSurface }))
    .catch((error: unknown) => {
      console.error('[shell] remote "viewer" failed to load', error);
      return {
        default: () => (
          <p className="shell-canvas-message">Viewer unavailable</p>
        ),
      };
    }),
);

interface ActiveSheet {
  sheetId: string;
  revision: number;
}

export function App() {
  const [sheet, setSheet] = useState<ActiveSheet | null>(null);

  useEffect(
    () =>
      bus.subscribe("sheet:loaded", ({ sheetId, revision }) => {
        setSheet({ sheetId, revision });
      }),
    [],
  );

  return (
    <div className="shell">
      <div className="shell-topbar" role="toolbar" aria-orientation="horizontal">
        <span className="shell-wordmark">Gridline</span>

        <span className="shell-separator" aria-hidden="true" />

        <span className="shell-set">Tower B — Permit Set</span>

        <span className="shell-separator" aria-hidden="true" />

        {sheet ? (
          <span className="shell-sheet">
            <span className="shell-sheet-number">{sheet.sheetId}</span>
            <span className="shell-sheet-revision">REV {sheet.revision}</span>
            {/* Static: the title is not part of the sheet:loaded contract. It
                comes from the sheet index, which Navigator will own. */}
            <span className="shell-sheet-title">Level 1 Floor Plan</span>
          </span>
        ) : (
          <span className="shell-sheet-pending">No sheet loaded</span>
        )}
      </div>

      <main className="shell-canvas">
        <RemoteBoundary
          name="viewer"
          fallback={
            <p className="shell-canvas-message">Viewer unavailable</p>
          }
        >
          <Suspense
            fallback={<p className="shell-canvas-message">Loading viewer…</p>}
          >
            <SheetSurface sheetId="A-101" revision={4} />
          </Suspense>
        </RemoteBoundary>
      </main>
    </div>
  );
}
