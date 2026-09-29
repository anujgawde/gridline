import { createModuleFederationConfig } from "@module-federation/enhanced/rspack";

export default createModuleFederationConfig({
  name: "shell",

  // The shell is a consumer only — it exposes nothing, so there is nothing for
  // another app to read a manifest of. Producers set this to true.
  manifest: false,

  // MF can download a remote's .d.ts files at build time. Left on, it wrote
  // apps/shell/@mf-types/ by fetching from the running viewer — generated code
  // in the source tree, and a typecheck that quietly depends on a remote being
  // up. A fresh clone and CI must typecheck with nothing else running, so the
  // contract is hand-written in src/remotes.d.ts instead.
  dts: false,

  // The address is fixed here for now. Moving it into a lookup the shell reads
  // at runtime is the next step, and is what lets a remote move without the
  // shell being rebuilt.
  //
  // The entry is remoteEntry.js and NOT mf-manifest.json, which is measured
  // rather than assumed. Pointing a declared remote at a manifest makes the
  // runtime fetch that manifest during federation init, and init gates the async
  // boundary in main.tsx — so a viewer that is simply down leaves #root empty.
  // Not a degraded shell: no shell at all, and no error React can catch.
  // A .js entry is resolved when the module is first requested instead, which
  // puts the failure inside the remote's own slot where app.tsx handles it.
  //
  // The viewer still emits a manifest; the next step consumes it via
  // registerRemotes, which also runs after the shell has rendered.
  remotes: {
    viewer: "viewer@http://localhost:4101/remoteEntry.js",
  },

  // Must match apps/viewer's block exactly — it is the version contract between
  // the two apps. See the comments there for why requiredVersion is explicit and
  // why the trailing-slash keys are required.
  shared: {
    react: { singleton: true, requiredVersion: "^19.3.0" },
    "react/": { singleton: true, requiredVersion: "^19.3.0" },
    "react-dom": { singleton: true, requiredVersion: "^19.3.0" },
    "react-dom/": { singleton: true, requiredVersion: "^19.3.0" },
    "@gridline/platform/bus": { singleton: true, requiredVersion: false },
  },
});
