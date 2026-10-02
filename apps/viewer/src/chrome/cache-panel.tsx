import { useEffect, useState } from "react";

import { Badge } from "@gridline/platform/ui";

import type { TileStats } from "../renderers";
import type { CachePanelProps } from "./types";

/* How often the panel asks. Slow on purpose: the draw loop runs at the refresh
   rate, and a panel that followed it would re-render 60 times a second to show
   numbers nobody can read that fast. Four times a second is faster than the eye
   tracks a changing figure and costs four renders where the alternative cost
   sixty. */
const SAMPLE_MS = 250;

const MB = 1024 * 1024;

/* Whether the page was asked for the panel, read from `?perf=1`.

   Off by default: it covers part of a drawing, and the people this app is for
   are reading the drawing. Behind a query string rather than a build flag so the
   same deployed bundle can be inspected — the panel is for looking at a running
   build, and one that only exists in development cannot do that. */
export function cachePanelRequested(search = window.location.search) {
  return new URLSearchParams(search).get("perf") === "1";
}

function mb(bytes: number) {
  return `${(bytes / MB).toFixed(1)} MB`;
}

/* Hit rate over the session, not over a window.

   Undefined rather than zero before anything has been needed: a rate printed as
   "0%" when the denominator is zero is a measurement nobody took. */
function hitRate(stats: TileStats) {
  const needed = stats.hits + stats.misses;
  if (needed === 0) return undefined;
  return Math.round((stats.hits / needed) * 100);
}

/* The cache readout, over the canvas.

   Viewer chrome rather than the shell's, by the deploy-cadence test: it displays
   this app's tile cache, so it changes when this renderer changes and nothing
   else ships. Shown only on request — a field user has no use for it over a
   drawing — so it is behind `?perf=1`, the same idiom as `?renderer=`.

   What it is not: proof the cache stays inside its budget. Every figure here is
   the cache reporting on itself, and a bound it exceeded without noticing would
   be mis-stated here too. That claim is made by the Playwright specs, which
   sample the browser's own memory from outside. This panel is for seeing which
   way the numbers are moving while working on them. */
export function CachePanel({ source }: CachePanelProps) {
  const [stats, setStats] = useState<TileStats | null>(null);

  useEffect(() => {
    if (!source) return;
    /* Read once immediately, so opening the panel does not show an empty frame
       for a quarter of a second. */
    setStats(source());
    const timer = setInterval(() => setStats(source()), SAMPLE_MS);
    return () => clearInterval(timer);
  }, [source]);

  const rate = stats ? hitRate(stats) : undefined;

  return (
    <aside className="viewer-cache-panel" aria-label="Tile cache">
      <h2 className="viewer-cache-title gf-micro">Tile cache</h2>

      {stats === null ? (
        <p className="viewer-cache-absent">Waiting for a sheet</p>
      ) : (
        <dl className="viewer-cache-rows">
          <Row label="Held">
            <span className="gf-data">{mb(stats.bytes)}</span>
            <span className="viewer-cache-note">
              {stats.count} tiles · {stats.sheets}{" "}
              {stats.sheets === 1 ? "sheet" : "sheets"}
            </span>
          </Row>

          {/* The pinned share separately, because the plateau is its doing. A
              total at rest tells you nothing about whether the ceiling binds. */}
          <Row label="Pinned">
            <span className="gf-data">{mb(stats.pinnedBytes)}</span>
          </Row>

          <Row label="Hit rate">
            {rate === undefined ? (
              <span className="viewer-cache-absent">Nothing needed yet</span>
            ) : (
              <>
                <Badge mono small tone={rate >= 50 ? "accent" : "neutral"}>
                  {rate}%
                </Badge>
                <span className="viewer-cache-note">
                  {stats.hits} resident · {stats.misses} fetched
                </span>
              </>
            )}
          </Row>

          <Row label="Evictions">
            <span className="gf-data">{stats.evictions}</span>
          </Row>

          <Row label="In flight">
            <span className="gf-data">{stats.pending}</span>
          </Row>

          <Row label="Level">
            <span className="gf-data">{stats.level}</span>
            <span className="viewer-cache-note">
              {stats.scale.toFixed(2)}x
            </span>
          </Row>
        </dl>
      )}
    </aside>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="viewer-cache-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
