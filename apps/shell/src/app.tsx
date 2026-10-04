import { Suspense, lazy, useEffect, useRef, useState } from "react";

import { bus } from "@gridline/platform/bus";
import { IconButton, Toolbar } from "@gridline/platform/ui";

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

type View = "sheets" | "drawing";

/* Which sheet the shell asks for, read from `?sheet=`. The set is generated, so
   any sheet number in it is reachable — useful for checking a measurement is not
   an artefact of one particular sheet. */
function requestedSheet(): string | null {
  const value = new URLSearchParams(window.location.search).get("sheet");
  return value && /^[A-Z]{1,2}-\d{3}$/.test(value) ? value : null;
}

/* `?view=sheets` shows the whole set full-screen instead of a drawing, so a
   measurement can open it directly. */
function requestedView(): View {
  return new URLSearchParams(window.location.search).get("view") === "sheets"
    ? "sheets"
    : "drawing";
}

/* The address for a view and sheet. Every other parameter is kept: the
   measurement switches (`?thumbs=0`, `?renderer=`, …) have to survive moving
   between views, or a run would change what it measures halfway through. */
function addressFor(view: View, sheetId: string) {
  const params = new URLSearchParams(window.location.search);
  if (view === "sheets") params.set("view", "sheets");
  else params.delete("view");
  params.set("sheet", sheetId);
  return `${window.location.pathname}?${params}`;
}

export function App() {
  const [sheet, setSheet] = useState<ActiveSheet | null>(null);
  const [sheetId, setSheetId] = useState(() => requestedSheet() ?? "A-101");
  const [view, setView] = useState(requestedView);
  /* Read by the bus handler below, which subscribes once. */
  const viewRef = useRef(view);
  viewRef.current = view;

  /* Whoever asks for a sheet — the navigator, or the box in this bar — the
     shell shows the drawing. Leaving the grid is a new history entry, so Back
     returns to it; a sheet change within the drawing replaces the entry, so
     Back does not step through every sheet visited. */
  useEffect(
    () =>
      bus.subscribe("sheet:open", ({ sheetId: next }) => {
        const leavingGrid = viewRef.current === "sheets";
        const address = addressFor("drawing", next);
        if (leavingGrid) window.history.pushState(null, "", address);
        else window.history.replaceState(null, "", address);
        setSheetId(next);
        setView("drawing");
      }),
    [],
  );

  useEffect(() => {
    /* An address that names no sheet keeps the current one, so returning to
       a grid opened without one still remembers what the drawing showed. */
    const restore = () => {
      setView(requestedView());
      setSheetId((current) => requestedSheet() ?? current);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const showView = (next: View) => {
    window.history.pushState(null, "", addressFor(next, sheetId));
    setView(next);
  };

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

        {/* The sheet controls belong to the drawing. On the sheet index a sheet
            is opened by choosing it there, and a control that silently
            switched views from the top bar would be a second way out. */}
        {view === "drawing" && (
          <>
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
          </>
        )}
      </div>

      <div className="shell-body">
        {/* The rail launches apps, so it is the shell's: adding a tool to the
            viewer never changes it. "Sheet index" opens the whole set and,
            pressed again, returns to the drawing. */}
        <Toolbar orientation="vertical" aria-label="Apps">
          <IconButton
            icon="layers"
            label="Sheet index"
            active={view === "sheets"}
            onClick={() => showView(view === "sheets" ? "drawing" : "sheets")}
          />
        </Toolbar>

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
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
