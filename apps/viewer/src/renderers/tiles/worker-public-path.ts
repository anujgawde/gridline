/* Imported first by a worker started through RemoteWorker, before anything
   loads a chunk. Rspack derives the public path from `self.location`, which
   is the bootstrap blob on the shell's origin; the chunk's real URL, left by
   the blob, puts it back on the remote that owns the worker. */
declare let __webpack_public_path__: string;

const url = (self as unknown as { __remoteWorkerUrl?: string }).__remoteWorkerUrl;
if (url) __webpack_public_path__ = new URL(".", url).href;
