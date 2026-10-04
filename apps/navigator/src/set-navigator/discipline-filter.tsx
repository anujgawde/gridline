import type { MouseEvent } from "react";

import { Button } from "@gridline/platform/ui";

import type { DisciplineGroup } from "./types";

/* One toggle per discipline in the set, each with its sheet count. A pressed
   toggle is a discipline shown; all are pressed to begin with, so the set
   opens complete.

   Toggles report the click's own timestamp, so the time to apply a filter can
   be measured from the input rather than from when React got to it. */
export function DisciplineFilter({
  groups,
  hidden,
  onToggle,
  onClear,
}: {
  groups: DisciplineGroup[];
  hidden: ReadonlySet<string>;
  onToggle: (discipline: string, at: number) => void;
  onClear: (at: number) => void;
}) {
  return (
    <div className="discipline-filter" role="group" aria-label="Disciplines">
      <span className="discipline-filter-label" aria-hidden="true">
        Discipline
      </span>
      <div className="discipline-filter-toggles">
        {groups.map((group) => {
          const shown = !hidden.has(group.discipline);
          return (
            <Button
              key={group.discipline}
              variant={shown ? "secondary" : "ghost"}
              size="sm"
              icon={shown ? "check" : undefined}
              aria-pressed={shown}
              aria-label={`${group.name}, ${group.sheets.length} sheets`}
              title={group.name}
              data-discipline={group.discipline}
              onClick={(event: MouseEvent) => onToggle(group.discipline, event.timeStamp)}
            >
              <span className="discipline-filter-code">{group.discipline}</span>
              <span className="discipline-filter-count">{group.sheets.length}</span>
            </Button>
          );
        })}
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon="search-x"
        disabled={hidden.size === 0}
        onClick={(event: MouseEvent) => onClear(event.timeStamp)}
      >
        Clear filters
      </Button>
    </div>
  );
}
