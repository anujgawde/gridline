import { useEffect, useState } from "react";

import type { Pyramid } from "../pyramid";
import { RemoteWorker } from "./remote-worker";
import { detectRequest } from "./request";
import { runDetection } from "./run";
import { detectLevelOverride, detectOnMainThread } from "./switches";
import type { ChangeRegion, ChangesState, DetectResponse } from "./types";

/* From asking to the answer arriving: worker start, tile fetches and the
   diff. The regions ride along in `detail`, so the coverage spec can check
   them without the page exposing anything else. Read as
   `gridline:changes-found`. */
const CHANGES_FOUND = "gridline:changes-found";

/* One detection per pair of revisions, run in a worker and held only in
   state. A failure stays here: both modes still draw without it. */
export function useChanges(from: Pyramid | null, to: Pyramid | null): ChangesState {
  const [state, setState] = useState<ChangesState>({ status: "detecting" });

  useEffect(() => {
    if (!from || !to) return;
    setState({ status: "detecting" });
    const label = `${to.ref.sheetId} REV ${from.ref.revision} → ${to.ref.revision}`;
    const started = performance.now();
    let live = true;

    const fail = (reason: unknown) => {
      console.error(`[compare] change detection failed for ${label}`, reason);
      if (live) setState({ status: "failed" });
    };
    const found = (regions: ChangeRegion[], ms: number) => {
      if (!live) return;
      performance.measure(CHANGES_FOUND, {
        start: started,
        detail: { sheetId: to.ref.sheetId, from: from.ref.revision, to: to.ref.revision, regions },
      });
      console.info(`[compare] ${label}: ${regions.length} changes in ${ms} ms`);
      setState({ status: "ready", regions });
    };

    let request;
    try {
      request = detectRequest(from, to, detectLevelOverride() ?? undefined);
    } catch (error) {
      fail(error);
      return;
    }

    if (detectOnMainThread()) {
      runDetection(request).then(({ regions, ms }) => found(regions, ms), fail);
      return () => {
        live = false;
      };
    }

    const worker = new RemoteWorker(new URL("./detect.worker.ts", import.meta.url));
    worker.onmessage = ({ data }: MessageEvent<DetectResponse>) => {
      worker.terminate();
      if ("error" in data) return fail(data.error);
      found(data.regions, data.ms);
    };
    worker.onerror = (event) => {
      worker.terminate();
      fail(event.message || "the worker did not start");
    };
    worker.postMessage(request);

    return () => {
      live = false;
      worker.terminate();
    };
  }, [from, to]);

  return state;
}
