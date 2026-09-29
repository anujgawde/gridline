/* What the shell expects each remote to expose.

   Module Federation can generate and fetch these types from a running producer,
   but that makes this app's typecheck depend on the viewer being built and
   served — a build-time coupling between two apps that are supposed to deploy
   independently. Restating the surface here keeps them decoupled, and is the
   same discipline as validating bus payloads instead of trusting types across a
   runtime boundary. If it drifts from what viewer exposes, the mismatch shows
   up as a runtime error in the remote's own slot, not as a broken host. */
declare module "viewer/SheetSurface" {
  import type { ComponentType } from "react";

  export const SheetSurface: ComponentType<{
    sheetId: string;
    revision: number;
  }>;
}
