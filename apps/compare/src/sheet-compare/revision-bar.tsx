import { bus } from "@gridline/platform/bus";

import { RevisionPicker } from "./revision-picker";
import { useLatestRevision } from "./use-latest-revision";

interface RevisionBarProps {
  sheetId: string;
  from: number;
  to: number;
}

const range = (first: number, last: number) =>
  Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);

/* Which two revisions are compared, each in the colour that marks its
   linework. FROM offers anything older than TO, TO anything newer than FROM.

   Choosing is a new `compare:request` rather than local state: the shell owns
   the address, and asking the same way everyone else does keeps it the one
   way into a comparison. Dates and descriptions join this bar once the set
   carries revision history. */
export function RevisionBar({ sheetId, from, to }: RevisionBarProps) {
  const latest = useLatestRevision(sheetId);
  const known = latest !== null && to <= latest;
  const ask = (next: { from: number; to: number }) =>
    bus.publish("compare:request", { sheetId, ...next });

  return (
    <div className="compare-revisions">
      <span className="compare-micro">From</span>
      <RevisionPicker
        side="from"
        value={from}
        choices={known ? range(1, to - 1) : [from]}
        onChange={(r) => ask({ from: r, to })}
      />
      <span className="compare-arrow" aria-hidden="true">→</span>
      <span className="compare-micro">To</span>
      <RevisionPicker
        side="to"
        value={to}
        choices={known && latest !== null ? range(from + 1, latest) : [to]}
        onChange={(r) => ask({ from, to: r })}
      />
    </div>
  );
}
