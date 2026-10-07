import { runDetection } from "./run";
import type { DetectRequest, DetectResponse } from "./types";

/* Detection off the page's thread: a dozen decodes, two full-level readbacks
   and a pass over a few million pixels would otherwise block it. */
self.onmessage = async ({ data }: MessageEvent<DetectRequest>) => {
  const reply = (response: DetectResponse) => self.postMessage(response);
  try {
    reply(await runDetection(data));
  } catch (error) {
    reply({ error: error instanceof Error ? error.message : String(error) });
  }
};
