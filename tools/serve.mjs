#!/usr/bin/env node
// Serves a production build from a folder, one app per port, so each app is
// reached on its own origin with no bundler in the request path.
//
// Dependency free on purpose. The reason to serve `dist/` at all is to see
// exactly what a static host would be handed, and a server framework in the
// middle reintroduces conveniences a host would not provide — which is how a
// header that only exists in `devServer` survives review.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import { createBrotliCompress, createGzip } from "node:zlib";

const { values } = parseArgs({
  options: {
    dir: { type: "string" },
    port: { type: "string" },
    cors: { type: "boolean", default: false },
  },
});

if (!values.dir || !values.port) {
  console.error("usage: serve.mjs --dir <folder> --port <number> [--cors]");
  process.exit(1);
}

const root = resolve(values.dir);
const port = Number(values.port);

try {
  if (!(await stat(root)).isDirectory()) throw new Error("not a directory");
} catch {
  console.error(`${root} is not a built folder — run \`pnpm build\` first.`);
  process.exit(1);
}

// Content types matter more than they appear to. A JavaScript chunk served as
// text/plain is refused by the browser's module loader, and the resulting error
// names the federated module rather than the header that caused it.
const TYPES = new Map(
  Object.entries({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".ico": "image/x-icon",
  }),
);

// Text compresses; images, fonts and PDFs are already compressed and gzipping
// them spends CPU to add bytes. This list is deliberately close to what a CDN
// compresses by default, PDF included in the exclusions — a host does not
// compress application/pdf either.
const COMPRESSIBLE = /^(text\/|application\/(javascript|json)|image\/svg\+xml)/;

// A deployed build is served compressed: every static host and CDN negotiates
// gzip or brotli from Accept-Encoding, and §7's bundle budgets are written in
// gzip for that reason. Serving raw here would inflate every byte-bound
// measurement by roughly 3x and quietly make the numbers about this file rather
// than about the app — the same trap as a header that only exists in devServer.
//
// Pre-compressed .br/.gz files on disk are the other half of how this works in
// production, but they are a build concern; what a host does for you is this.
function negotiate(acceptEncoding = "", contentType) {
  if (!COMPRESSIBLE.test(contentType)) return null;
  const accepted = acceptEncoding.toLowerCase();
  if (accepted.includes("br")) return { encoding: "br", create: createBrotliCompress };
  if (accepted.includes("gzip")) return { encoding: "gzip", create: createGzip };
  return null;
}

async function resolveFile(url) {
  const path = decodeURIComponent(url.split("?")[0]);
  const candidate = resolve(join(root, path === "/" ? "/index.html" : path));

  // Keep every served path inside the folder. Without this check a request for
  // a path of ../ segments reads the filesystem above it.
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;

  try {
    return (await stat(candidate)).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const headers = {
    // Nothing is cached. A deploy check reloads the page expecting the bytes
    // currently on disk, and a cached remoteEntry.js would serve the previous
    // deployment — which reads as the new one having failed to ship.
    "Cache-Control": "no-store",
  };

  // Only a remote opens itself to other origins. The shell has no reason to,
  // and withholding the header here keeps that asymmetry visible rather than
  // blanket-enabling it and forgetting which side needed it.
  if (values.cors) headers["Access-Control-Allow-Origin"] = "*";

  const file = await resolveFile(req.url ?? "/");

  if (!file) {
    // A missing file is a 404, never a fall back to index.html. The shell
    // fetches /remotes.json over the network and validates it; answering that
    // request with a page of HTML would surface as a schema error far from the
    // actual cause.
    res.writeHead(404, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
    res.end("404\n");
    return;
  }

  const contentType = TYPES.get(extname(file)) ?? "application/octet-stream";
  headers["Content-Type"] = contentType;

  const encoding = negotiate(req.headers["accept-encoding"], contentType);

  // Always present, compressed or not: the response for a URL varies by request
  // header, and a cache that does not know that can hand a gzip body to a client
  // that asked for none.
  headers["Vary"] = "Accept-Encoding";

  if (!encoding) {
    res.writeHead(200, headers);
    createReadStream(file).pipe(res);
    return;
  }

  headers["Content-Encoding"] = encoding.encoding;
  res.writeHead(200, headers);

  try {
    await pipeline(createReadStream(file), encoding.create(), res);
  } catch {
    // A client that navigated away mid-response aborts the pipeline. Nothing to
    // report: the socket is already gone.
    res.destroy();
  }
});

// Each app is served on the same port its dev server uses, so the remote lookup
// needs no second copy for this mode. The cost is that the two cannot run at
// once, and the default failure for that is an unhandled event and a stack
// trace, which reads as a bug in this file rather than a port already taken.
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`port ${port} is already in use — stop \`pnpm dev\` first.`);
    process.exit(1);
  }
  throw error;
});

server.listen(port, () => {
  const origin = `http://localhost:${port}`;
  console.log(`serving ${root} on ${origin}${values.cors ? " (cors: *)" : ""}`);
});
