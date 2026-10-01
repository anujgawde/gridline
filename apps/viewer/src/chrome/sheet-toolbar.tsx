import {
  IconButton,
  Toolbar,
  ToolbarSeparator,
} from "@gridline/platform/ui";

import type { SheetToolbarProps } from "./types";

/* The canvas overlay toolbar — the viewer's own controls, floating over the
   drawing.

   This is viewer's chrome rather than the shell's, and the test that decides it
   is the deploy cadence: adding a tool here must not require the shell to ship.
   The shell's rail is the other half of that answer — it launches other apps,
   so it holds no viewer tools and never changes when one is added.

   The tool group is in the design and only Pan is built. The rest are rendered
   disabled rather than omitted: the group is one control in the mockups, and a
   toolbar that grows a button later moves every button beside it. A disabled
   control with a tooltip says what is true. */
export function SheetToolbar({ controls }: SheetToolbarProps) {
  const ready = controls !== null;

  /* Positioned by a viewer-owned wrapper rather than by a style prop on the
     primitive. The primitive deliberately refuses className so an app cannot
     quietly restyle it, and positioning through inline `style` would put raw
     lengths back into app code, which the token rules exist to prevent. */
  return (
    <div className="viewer-toolbar-slot">
      <Toolbar tier="overlay" align="center" aria-label="Sheet tools">
        <IconButton icon="hand" label="Pan" active />
        <IconButton
          icon="pencil"
          label="Markup"
          title="Markup — not built yet"
          disabled
        />
        <IconButton
          icon="ruler"
          label="Measure"
          title="Measure — not built yet"
          disabled
        />
        <IconButton
          icon="square-dashed"
          label="Area"
          title="Area — not built yet"
          disabled
        />
        <IconButton
          icon="message-square"
          label="Note"
          title="Note — not built yet"
          disabled
        />

        <ToolbarSeparator />

        <IconButton
          icon="minus"
          label="Zoom out"
          disabled={!ready}
          onClick={() => controls?.zoomOut()}
        />
        <IconButton
          icon="plus"
          label="Zoom in"
          disabled={!ready}
          onClick={() => controls?.zoomIn()}
        />
        <IconButton
          icon="maximize"
          label="Fit sheet"
          disabled={!ready}
          onClick={() => controls?.fit()}
        />
      </Toolbar>
    </div>
  );
}
