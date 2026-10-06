import { useEffect, useState } from "react";

import type { Pyramid } from "../pyramid";
import { RemoteWorker } from "./remote-worker";
import { detectRequest } from "./request";
import type { ChangesState, DetectResponse } from "./types";

/* One detection per pair of revisions, run in a worker and held only in
   state. A failure stays here: both modes still draw without it. */
export function useChanges(from: Pyramid | null, to: Pyramid | null): ChangesState {
  const [state, setState] = useState<ChangesState>({ status: "detecting" });

  useEffect(() => {
    if (!from || !to) return;
    setState({ status: "detecting" });
    const label = `${to.ref.sheetId} REV ${from.ref.revision} → ${to.ref.revision}`;
    const fail = (reason: unknown) => {
      console.error(`[compare] change detection failed for ${label}`, reason);
      setState({ status: "failed" });
    };

    let request;
    try {
      request = detectRequest(from, to);
    } catch (error) {
      fail(error);
      return;
    }

    const worker = new RemoteWorker(new URL("./detect.worker.ts", import.meta.url));
    worker.onmessage = ({ data }: MessageEvent<DetectResponse>) => {
      worker.terminate();
      if ("error" in data) return fail(data.error);
      console.info(`[compare] ${label}: ${data.regions.length} changes in ${data.ms} ms`);
      setState({ status: "ready", regions: data.regions });
    };
    worker.onerror = (event) => {
      worker.terminate();
      fail(event.message || "the worker did not start");
    };
    worker.postMessage(request);

    return () => worker.terminate();
  }, [from, to]);

  return state;
}
