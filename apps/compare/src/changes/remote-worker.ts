/* A Worker that can start from a remote's own origin.

   A worker script must be same-origin with the *document*, and compare runs
   inside the shell's page while being served from its own origin, so
   `new Worker("http://localhost:4103/…")` is refused and no CORS header
   changes that. A blob URL inherits the document's origin, and a classic
   worker may `importScripts` across origins, so the blob loads the real
   script from the remote that owns it.

   Rspack is told this constructor is worker syntax (`parser.javascript.worker`
   in rspack.config.ts), so `new RemoteWorker(new URL("./x.worker.ts",
   import.meta.url))` compiles the worker as its own chunk and passes that
   chunk's URL in. Called as plain `new Worker`, the file would be copied
   uncompiled. */
export class RemoteWorker extends Worker {
  readonly #bootstrap: string;

  constructor(url: URL | string) {
    const bootstrap = URL.createObjectURL(
      new Blob([`importScripts(${JSON.stringify(String(url))});`], { type: "text/javascript" }),
    );
    super(bootstrap);
    // Revoked on terminate, not here: the worker fetches the blob
    // asynchronously, and revoking now pulls the script out from under it.
    this.#bootstrap = bootstrap;
  }

  override terminate() {
    super.terminate();
    URL.revokeObjectURL(this.#bootstrap);
  }
}
