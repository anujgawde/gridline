import type { ComponentType } from "react";

import { loadRemote, registerRemotes } from "@module-federation/enhanced/runtime";
import { z } from "zod";

/* The lookup document arrives over the network from outside this app, so it is
   validated rather than trusted — the same rule the bus applies to its payloads.
   A malformed lookup has to degrade, not throw during startup. */
const RemoteLookup = z.object({
  remotes: z
    .object({
      name: z.string().min(1),
      entry: z.string().url(),
    })
    .array(),
});

/* What the shell expects each remote to expose.

   Federation can generate these types by fetching them from a running producer,
   which would make this app's typecheck depend on the viewer being up — a
   build-time coupling between apps meant to deploy independently. Restating the
   surface here keeps them decoupled. If it drifts from what the viewer actually
   exposes, the mismatch surfaces as an error inside that remote's own slot. */
export interface ViewerSheetSurface {
  SheetSurface: ComponentType<{ sheetId: string; revision: number }>;
}

export function loadSheetSurface() {
  return loadRemote("viewer/SheetSurface") as Promise<ViewerSheetSurface>;
}

export interface NavigatorSetNavigator {
  SetNavigator: ComponentType<{ layout: "grid" | "panel" }>;
}

export function loadSetNavigator() {
  return loadRemote("navigator/SetNavigator") as Promise<NavigatorSetNavigator>;
}

/* Fetches the lookup and registers whatever it names.

   Never throws. A lookup that is missing, unreachable or malformed leaves the
   remotes unregistered, and every remote slot then renders its unavailable state
   while the shell itself is unaffected. That is the point of resolving addresses
   here instead of declaring them in the build: this runs after the shell has
   rendered, so nothing a remote does can stop the shell starting. */
export async function registerRemotesFromLookup(url = "/remotes.json") {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url} responded ${response.status}`);
    }

    const { remotes } = RemoteLookup.parse(await response.json());
    registerRemotes(remotes);
    return remotes.map((r) => r.name);
  } catch (error) {
    console.error(
      `[shell] remote lookup failed; continuing with no remotes registered`,
      error,
    );
    return [];
  }
}
