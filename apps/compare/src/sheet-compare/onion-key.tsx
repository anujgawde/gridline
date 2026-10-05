interface OnionKeyProps {
  from: number;
  to: number;
}

/* What each colour on the onion skin means. */
export function OnionKey({ from, to }: OnionKeyProps) {
  const rows = [
    { side: "from", text: `Only in REV ${from}` },
    { side: "to", text: `Only in REV ${to}` },
    { side: "both", text: "Unchanged in both" },
  ];
  return (
    <div className="compare-onion-key">
      <span className="compare-micro">Onion skin key</span>
      {rows.map((r) => (
        <span key={r.side} className="compare-onion-key-row" data-side={r.side}>
          <span className="compare-onion-key-sample">
            <span className="compare-onion-key-line" />
          </span>
          {r.text}
        </span>
      ))}
    </div>
  );
}
