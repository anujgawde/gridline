import { Suspense, lazy, useEffect, useState } from "react";

import { bus } from "@gridline/platform/bus";

import { RemoteBoundary } from "./remote-boundary";
import { SheetNav } from "./sheet-nav";
import { loadSetNavigator, loadSheetSurface } from "./remotes";

/* loadRemote rather than import(): with no remote declared in the build config,
   the bundler no longer knows this specifier names a remote, so import syntax
   cannot resolve it. That is the documented trade-off of registering at runtime.

   A remote that cannot be fetched — including one absent from the lookup
   entirely — rejects here, and the rejection is converted into a component so it
   stays inside this slot. RemoteBoundary covers the other case: the remote loaded
   and then threw while rendering. */
const SheetSurface = lazy(() =>
  loadSheetSurface()
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

const SetNavigator = lazy(() =>
  loadSetNavigator()
    .then((m) => ({ default: m.SetNavigator }))
    .catch((error: unknown) => {
      console.error('[shell] remote "navigator" failed to load', error);
      return {
        default: () => (
          <p className="shell-panel-message">Sheets unavailable</p>
        ),
      };
    }),
);

interface ActiveSheet {
  sheetId: string;
  revision: number;
}

/* Which sheet the shell asks for, read from `?sheet=`. The set is generated, so
   any sheet number in it is reachable — useful for checking a measurement is not
   an artefact of one particular sheet. Navigator will replace this. */
function requestedSheet() {
  const value = new URLSearchParams(window.location.search).get("sheet");
  return value && /^[A-Z]{1,2}-\d{3}$/.test(value) ? value : "A-101";
}

/* `?view=sheets` shows the whole set full-screen instead of a drawing. A URL
   rather than a control so a measurement can open it directly. */
function requestedView() {
  return new URLSearchParams(window.location.search).get("view") === "sheets"
    ? "sheets"
    : "drawing";
}

export function App() {
  const [sheet, setSheet] = useState<ActiveSheet | null>(null);
  const [sheetId] = useState(requestedSheet);
  const [view] = useState(requestedView);

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

        <SheetNav sheetId={sheet?.sheetId ?? sheetId} />

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

      {view === "sheets" ? (
        <main className="shell-sheets">
          <RemoteBoundary
            name="navigator"
            fallback={<p className="shell-panel-message">Sheets unavailable</p>}
          >
            <Suspense
              fallback={<p className="shell-panel-message">Loading sheets…</p>}
            >
              <SetNavigator layout="grid" />
            </Suspense>
          </RemoteBoundary>
        </main>
      ) : (
        <div className="shell-body">
          <aside className="shell-panel">
            <RemoteBoundary
              name="navigator"
              fallback={<p className="shell-panel-message">Sheets unavailable</p>}
            >
              <Suspense
                fallback={<p className="shell-panel-message">Loading sheets…</p>}
              >
                <SetNavigator layout="panel" />
              </Suspense>
            </RemoteBoundary>
          </aside>

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
                <SheetSurface sheetId={sheetId} revision={4} />
              </Suspense>
            </RemoteBoundary>
          </main>
        </div>
      )}
    </div>
  );
}
