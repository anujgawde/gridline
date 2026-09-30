import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@gridline/platform/tokens.css";

import { App } from "./app";
import { startMockNetwork } from "./mocks/browser";
import { registerRemotesFromLookup } from "./remotes";
import "./app.css";

/* Order matters and each step is allowed to fail.

   The mock network starts first, because it is what answers the lookup request —
   a fetch issued before the service worker is ready escapes to the real network.
   Then the lookup is read and its remotes registered. Only then does the shell
   render.

   Neither step can stop the render: startMockNetwork failing is caught here, and
   registerRemotesFromLookup never throws. A shell that cannot start because of
   something a remote did is the failure this whole step exists to prevent. */
async function start() {
  const container = document.getElementById("root");
  if (!container) throw new Error("#root is missing from index.html");

  try {
    await startMockNetwork();
  } catch (error) {
    console.error("[shell] mock network failed to start", error);
  }

  await registerRemotesFromLookup();

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
