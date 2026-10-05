interface RevisionBarProps {
  from: number;
  to: number;
}

/* Which two revisions are compared, each in the colour that marks its
   linework. The mockup's pickers, dates and descriptions join this bar once
   the set carries revision history; a picker with nothing to choose from
   would be a control that does nothing. */
export function RevisionBar({ from, to }: RevisionBarProps) {
  return (
    <div className="compare-revisions">
      <span className="compare-micro">From</span>
      <span className="compare-rev-chip">
        <span className="compare-swatch" data-side="from" />
        REV {from}
      </span>
      <span className="compare-arrow" aria-hidden="true">→</span>
      <span className="compare-micro">To</span>
      <span className="compare-rev-chip">
        <span className="compare-swatch" data-side="to" />
        REV {to}
      </span>
    </div>
  );
}
