import { HttpResponse, http, passthrough } from "msw";

/* Read from the page's own URL, not the intercepted request's. MSW's browser
   handlers run in the page context while the service worker only proxies, so
   window is available here. */
function isBreakRequested(what: string) {
  return new URLSearchParams(window.location.search).get("break") === what;
}

/* The remote lookup is a real static file, `public/remotes.json`, not something
   generated here. That matters: a handler lives in the shell's JavaScript bundle,
   so serving the lookup from one would put remote addresses back into the build
   and changing a remote would need the shell rebuilt — the exact coupling this
   step removes. As a deployed file it is data, and a remote's pipeline can rewrite
   it without the shell being touched.

   So this handler passes the request straight through by default. Its job is the
   opposite one: making the lookup fail on demand, so the shell's degradation can
   be demonstrated without editing or deleting files.

   Open the shell with ?break=lookup to see it. */
export const handlers = [
  http.get("/remotes.json", () =>
    isBreakRequested("lookup")
      ? HttpResponse.json({ error: "simulated lookup failure" }, { status: 503 })
      : passthrough(),
  ),
];
