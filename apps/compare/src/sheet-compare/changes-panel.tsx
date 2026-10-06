import { useEffect, useRef } from "react";

import { Badge, IconButton, Panel, PanelHeader } from "@gridline/platform/ui";

import { changeTitle, kindCounts, placeOf } from "./change-labels";
import type { ChangesPanelProps } from "./types";

/* The changes found between the two revisions, in reading order: a summary,
   a stepper, and a row per change. Choosing one, by row or by N and P, frames
   it in the panes; the selection lives with the caller, which also owns the
   views. */
export function ChangesPanel({ sheetId, from, to, page, changes, selectedId, onSelect, onStep }: ChangesPanelProps) {
  const list = useRef<HTMLDivElement>(null);
  const regions = changes.status === "ready" ? changes.regions : [];
  const position = regions.findIndex((r) => r.id === selectedId) + 1;

  // Stepping with the keys can land on a row scrolled out of sight.
  useEffect(() => {
    list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <Panel
      side="right"
      aria-label="Changes"
      header={<PanelHeader title="Changes" meta={`${sheetId} · REV ${from} → REV ${to}`} />}
      footer={<span className="compare-key-hint">N next · P previous · O onion · S side by side · F fit · Esc exit</span>}
    >
      {changes.status !== "ready" || regions.length === 0 ? (
        <p className="compare-changes-message">
          {changes.status === "detecting"
            ? "Finding changes…"
            : changes.status === "failed"
              ? "Couldn't detect changes"
              : "No differences found"}
        </p>
      ) : (
        <>
          <div className="compare-changes-summary">
            <div className="compare-changes-count">
              <span className="compare-changes-total">{regions.length}</span>
              <span className="compare-changes-label">{regions.length === 1 ? "change detected" : "changes detected"}</span>
            </div>
            <div className="compare-changes-kinds">
              {kindCounts(regions).map(({ kind, count }) => (
                <Badge key={kind} small>
                  {count} {kind}
                </Badge>
              ))}
            </div>
          </div>

          <div className="compare-changes-stepper">
            <span className="compare-changes-position">
              {position > 0 ? `Change ${position} of ${regions.length}` : `${regions.length} to step through`}
            </span>
            <IconButton icon="chevron-up" label="Previous change (P)" onClick={() => onStep(-1)} />
            <IconButton icon="chevron-down" label="Next change (N)" onClick={() => onStep(1)} />
          </div>

          <div ref={list}>
            {regions.map(({ id, kind, rect }) => (
              <button
                key={id}
                type="button"
                className="compare-change"
                aria-current={id === selectedId || undefined}
                onClick={() => onSelect(id)}
              >
                <span className="compare-change-swatch" data-kind={kind} aria-hidden="true" />
                <span className="compare-change-number">{String(id).padStart(2, "0")}</span>
                <span className="compare-change-text">
                  <span className="compare-change-title">{changeTitle(kind)}</span>
                  <span className="compare-change-meta">
                    {page ? `${placeOf(rect, page)} · ${kind}` : kind}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
