import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";

const worker = setupWorker(...handlers);

/* Starts the mock network. Awaiting matters: registering a service worker is
   asynchronous, and any request made before it finishes escapes to the real
   network — which for the remote lookup means a 404 rather than the document.

   onUnhandledFrame is "bypass" because the worker sees *every* request this page
   makes, and almost all of them are real: the remote's entry, the webfonts, the
   app's own chunks. The default "warn" also lets them through but logs each one,
   which buries anything worth reading. Note the option name — MSW 3 renamed it
   from onUnhandledRequest, since it now covers WebSocket connections as well as
   requests.

   Unlike most MSW setups this is NOT gated to development. There is no backend in
   this project at all, so this is the network layer rather than a stand-in for
   one. Gating it would leave the production build with no network. */
/* Bounded, because a service worker registration that never settles would
   otherwise hold up the render forever — the same class of failure as a dead
   remote, and just as unacceptable. Registration can stall or be refused
   outright: a browser with service workers disabled by policy, a private window,
   blocked site data, an automated browser.

   Giving up is safe. `remotes.json` is a real file on this origin, so a request
   that escapes an absent worker still gets the right answer. Losing the worker
   costs only the failure-injection in handlers.ts. */
const START_TIMEOUT_MS = 3_000;

export async function startMockNetwork() {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), START_TIMEOUT_MS);
  });

  try {
    const outcome = await Promise.race([
      worker.start({ onUnhandledFrame: "bypass" }).then(() => "started" as const),
      timeout,
    ]);
    if (outcome === "timeout") {
      console.warn(
        `[shell] mock network did not start within ${START_TIMEOUT_MS}ms; continuing without it`,
      );
    }
  } finally {
    clearTimeout(timer!);
  }
}
