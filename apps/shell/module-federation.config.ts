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

  // No `remotes` here, deliberately. Addresses are fetched and registered at
  // runtime instead — see src/remotes.ts — so this build contains no remote URL
  // and a remote can move without the shell being rebuilt.
  //
  // The stronger reason is startup. A remote declared here with a manifest entry
  // is fetched during federation init, and init gates the async boundary in
  // main.tsx: an unreachable remote then leaves the page empty before React runs,
  // with no error any boundary can catch. registerRemotes runs after the shell has
  // rendered, so no remote can prevent the shell starting. That makes the
  // degradation structural rather than a side effect of the address format.
  //
  // The plugin is still required. It provides `shared`, which is what makes React
  // and the bus resolve to one instance; only the addresses moved.

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
