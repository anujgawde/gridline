import { Badge, Panel, PanelHeader, RevisionBadge } from "@gridline/platform/ui";

import type { SheetPropertiesProps } from "./types";

/* The right-hand panel from the mockups.

   Every row is a value this app actually holds. The design also puts Markups
   and Revisions in this panel; neither has any data behind it yet, and a panel
   that displays plausible-looking revision history nobody generated is worse
   than a panel that is honest about its length. They arrive with the modules
   that produce them. */
export function SheetProperties({
  sheetId,
  revision,
  entry,
  renderer,
}: SheetPropertiesProps) {
  return (
    <Panel
      side="right"
      aria-label="Sheet properties"
      header={
        <PanelHeader title="Sheet properties" meta={`${sheetId} · REV ${revision}`} />
      }
    >
      <dl className="viewer-props">
        <div className="viewer-props-row">
          <dt>Sheet</dt>
          <dd className="gf-data">{sheetId}</dd>
        </div>

        <div className="viewer-props-row">
          <dt>Revision</dt>
          <dd>
            <RevisionBadge rev={revision} small />
          </dd>
        </div>

        {entry ? (
          <>
            <div className="viewer-props-row">
              <dt>Title</dt>
              <dd>{entry.title}</dd>
            </div>

            <div className="viewer-props-row">
              <dt>Discipline</dt>
              <dd>
                <Badge mono small>
                  {entry.discipline}
                </Badge>
              </dd>
            </div>

            {/* A sheet number is not a page number, and in a set of 1,500 that
                gap is the whole reason a navigator has to exist. Worth showing
                rather than hiding behind the lookup. */}
            <div className="viewer-props-row">
              <dt>Page in set</dt>
              <dd className="gf-data">{entry.pageNumber}</dd>
            </div>
          </>
        ) : (
          <div className="viewer-props-row">
            <dt>Index</dt>
            <dd className="viewer-props-absent">Not in the sheet index</dd>
          </div>
        )}

        {/* Which renderer drew this, because the comparison between the two is a
            URL anyone can open and the panel should say which one they are
            looking at. */}
        <div className="viewer-props-row">
          <dt>Renderer</dt>
          <dd>
            <Badge mono small tone={renderer === "tiled" ? "accent" : "neutral"}>
              {renderer}
            </Badge>
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
