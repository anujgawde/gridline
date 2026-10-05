import { Suspense, lazy, useEffect, useRef, useState } from "react";

import { bus } from "@gridline/platform/bus";
import { Button, Icon, IconButton, Toolbar } from "@gridline/platform/ui";

import { RemoteBoundary } from "./remote-boundary";
import { SheetNav } from "./sheet-nav";
import { loadSetNavigator, loadSheetCompare, loadSheetSurface } from "./remotes";

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

const SheetCompare = lazy(() =>
  loadSheetCompare()
    .then((m) => ({ default: m.SheetCompare }))
    .catch((error: unknown) => {
      console.error('[shell] remote "compare" failed to load', error);
      return {
        default: () => (
          <p className="shell-canvas-message">Compare unavailable</p>
        ),
      };
    }),
);

interface ActiveSheet {
  sheetId: string;
  revision: number;
}

type View = "sheets" | "drawing" | "compare";

/* The two revisions a comparison is between. */
interface RevisionRange {
  from: number;
  to: number;
}

/* Which sheet the shell asks for, read from `?sheet=`. The set is generated, so
   any sheet number in it is reachable — useful for checking a measurement is not
   an artefact of one particular sheet. */
function requestedSheet(): string | null {
  const value = new URLSearchParams(window.location.search).get("sheet");
  return value && /^[A-Z]{1,2}-\d{3}$/.test(value) ? value : null;
}

/* `?from=1&to=3`, read only for a comparison. Two different revisions, both
   positive whole numbers, or nothing. */
function requestedRange(): RevisionRange | null {
  const params = new URLSearchParams(window.location.search);
  const from = Number(params.get("from"));
  const to = Number(params.get("to"));
  const valid = (n: number) => Number.isInteger(n) && n > 0;
  return valid(from) && valid(to) && from !== to ? { from, to } : null;
}

/* `?view=sheets` shows the whole set full-screen instead of a drawing, so a
   measurement can open it directly. `?view=compare` needs a revision range as
   well; without one there is nothing to compare, and the drawing shows. */
function requestedView(): View {
  const view = new URLSearchParams(window.location.search).get("view");
  if (view === "sheets") return "sheets";
  if (view === "compare" && requestedRange()) return "compare";
  return "drawing";
}

/* The address for a view and sheet. Every other parameter is kept: the
   measurement switches (`?thumbs=0`, `?renderer=`, …) have to survive moving
   between views, or a run would change what it measures halfway through. */
function addressFor(view: View, sheetId: string, range?: RevisionRange) {
  const params = new URLSearchParams(window.location.search);
  if (view === "drawing") params.delete("view");
  else params.set("view", view);
  if (view === "compare" && range) {
    params.set("from", String(range.from));
    params.set("to", String(range.to));
  } else {
    params.delete("from");
    params.delete("to");
  }
  params.set("sheet", sheetId);
  return `${window.location.pathname}?${params}`;
}

export function App() {
  const [sheet, setSheet] = useState<ActiveSheet | null>(null);
  const [sheetId, setSheetId] = useState(() => requestedSheet() ?? "A-101");
  const [view, setView] = useState(requestedView);
  const [range, setRange] = useState(requestedRange);
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
      setRange(requestedRange());
      setSheetId((current) => requestedSheet() ?? current);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  /* Leaving a comparison shows the drawing of the sheet that was being
     compared. A new history entry, so Back returns to the comparison. */
  const leaveCompare = (closed: string) => {
    window.history.pushState(null, "", addressFor("drawing", closed));
    setSheetId(closed);
    setView("drawing");
  };

  /* The one way into compare: whoever asks — the navigator's superseded
     badge today, anything else that publishes the event later — the shell
     shows the comparison. Arriving is a new history entry, so Back returns to
     where it was asked from; changing revisions inside compare replaces the
     entry, so Back does not step through every pair tried. */
  useEffect(
    () =>
      bus.subscribe("compare:request", ({ sheetId: next, from, to }) => {
        const address = addressFor("compare", next, { from, to });
        if (viewRef.current === "compare") {
          window.history.replaceState(null, "", address);
        } else {
          window.history.pushState(null, "", address);
        }
        setSheetId(next);
        setRange({ from, to });
        setView("compare");
      }),
    [],
  );

  /* Compare can also say it is finished; the shell still decides what
     follows. */
  useEffect(
    () =>
      bus.subscribe("compare:closed", ({ sheetId: closed }) =>
        leaveCompare(closed),
      ),
    [],
  );

  /* Esc leaves a comparison, as the Exit button's hint says. The shell's key
     because leaving is the shell's decision. */
  useEffect(() => {
    if (view !== "compare") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") leaveCompare(sheetId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, sheetId]);

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

        {view === "compare" ? (
          <>
            <span className="shell-mode">
              <Icon name="columns-2" size={16} />
              Compare revisions
            </span>

            <span className="shell-separator" aria-hidden="true" />

            <span className="shell-sheet">
              <span className="shell-sheet-number">{sheetId}</span>
              <span className="shell-set">Tower B — Permit Set</span>
            </span>

            <span className="shell-spacer" />

            {/* The bar is the shell's, so leaving is too: what is on screen
                is the shell's decision, not Compare's. */}
            <Button variant="secondary" size="sm" icon="x" onClick={() => leaveCompare(sheetId)}>
              Exit compare <span className="shell-key-hint">Esc</span>
            </Button>
          </>
        ) : (
          <span className="shell-set">Tower B — Permit Set</span>
        )}

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
            viewer never changes it. Each item is a destination: pressing the
            one you are on does nothing. The way back to a drawing is to choose
            a sheet, or Back. */}
        <Toolbar orientation="vertical" aria-label="Apps">
          <IconButton
            icon="layers"
            label="Sheet index"
            active={view === "sheets"}
            onClick={() => view !== "sheets" && showView("sheets")}
          />
          {/* Opening a comparison needs two revisions, which the shell cannot
              know; a superseded badge asks for one. So this item only marks
              that a comparison is open — a destination you are on, which
              pressing does not leave. Exit and Esc do. */}
          <IconButton
            icon="columns-2"
            label="Compare revisions"
            active={view === "compare"}
            disabled={view !== "compare"}
          />
        </Toolbar>

        {view === "compare" && range ? (
          <main className="shell-compare">
            <RemoteBoundary
              name="compare"
              fallback={<p className="shell-canvas-message">Compare unavailable</p>}
            >
              <Suspense
                fallback={<p className="shell-canvas-message">Loading compare…</p>}
              >
                <SheetCompare sheetId={sheetId} from={range.from} to={range.to} />
              </Suspense>
            </RemoteBoundary>
          </main>
        ) : view === "sheets" ? (
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
