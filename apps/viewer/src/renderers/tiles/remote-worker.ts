/* A Worker that can start from a remote's own origin. Compare's class, plus
   the public path: remotes cannot import each other, and it holds no state,
   so each app carries its own copy.

   A worker script must be same-origin with the *document*, and the viewer runs
   inside the shell's page while being served from its own origin, so
   `new Worker("http://localhost:4101/…")` is refused and no CORS header
   changes that. A blob URL inherits the document's origin, and a classic
   worker may `importScripts` across origins, so the blob loads the real
   script from the remote that owns it.

   Rspack is told this constructor is worker syntax (`parser.javascript.worker`
   in rspack.config.ts), so `new RemoteWorker(new URL("./x.worker.ts",
   import.meta.url))` compiles the worker as its own chunk and passes that
   chunk's URL in. Called as plain `new Worker`, the file would be copied
   uncompiled.

   The blob also leaves the real URL on `self.__remoteWorkerUrl`. Rspack's
   "auto" public path reads `self.location`, which inside this worker is the
   blob's, on the shell's origin, so a worker that loads a further chunk asks
   the shell for it. `worker-public-path.ts` corrects it from this value, and
   no address is compiled into the bundle. Compare's worker loads no further
   chunk, which is why its copy never needed this. */
export class RemoteWorker extends Worker {
  readonly #bootstrap: string;

  constructor(url: URL | string) {
    const href = JSON.stringify(String(url));
    const bootstrap = URL.createObjectURL(
      new Blob([`self.__remoteWorkerUrl = ${href}; importScripts(${href});`], {
        type: "text/javascript",
      }),
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
