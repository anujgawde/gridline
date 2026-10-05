import { zoomPercent } from "../view";
import type { View } from "../view";

interface PaneHeaderProps {
  heading: string;
  revision: number;
  view: View | null;
}

/* Which revision this pane shows, and how far in it is. Each pane reads its
   own zoom, since unlocked the two can differ. */
export function PaneHeader({ heading, revision, view }: PaneHeaderProps) {
  return (
    <div className="compare-pane-header">
      <span className="compare-micro">{heading}</span>
      <span className="compare-pane-rev">REV {revision}</span>
      <span className="compare-spacer" />
      <span className="compare-pane-zoom">{view ? zoomPercent(view) : ""}</span>
    </div>
  );
}
