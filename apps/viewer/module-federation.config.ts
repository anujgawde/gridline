import { createModuleFederationConfig } from "@module-federation/enhanced/rspack";

export default createModuleFederationConfig({
  name: "viewer",
  filename: "remoteEntry.js",

  exposes: {
    "./SheetSurface": "./src/sheet-surface/index.ts",
  },

  // Off by default. The shell's remote URL points at mf-manifest.json, so
  // without this the build succeeds and the shell 404s at runtime.
  manifest: true,

  // Nothing consumes generated remote types — hosts hand-write the contract they
  // expect, so that their typecheck never depends on this app being reachable.
  // Emitting types no one reads just adds artifacts to dist/.
  dts: false,

  // This block must match the shell's. It is the version contract between the
  // two apps, so it is stated in both rather than inherited from one.
  //
  // requiredVersion is explicit because package.json says "catalog:", which the
  // plugin reads literally and cannot treat as a range. It also says a different
  // thing from the catalog: the catalog pins what gets installed, this states
  // the range every app must agree on at runtime.
  //
  // Trailing-slash keys are prefix matches covering subpath imports. Without
  // "react-dom/", `import { createRoot } from "react-dom/client"` bundles a
  // private second copy of react-dom and breaks the singleton.
  shared: {
    react: { singleton: true, requiredVersion: "^19.3.0" },
    "react/": { singleton: true, requiredVersion: "^19.3.0" },
    "react-dom": { singleton: true, requiredVersion: "^19.3.0" },
    "react-dom/": { singleton: true, requiredVersion: "^19.3.0" },
    // The bus subpath, not the package root: sharing the root would leave
    // "@gridline/platform/bus" bundled privately in each app. The bus keeps its
    // subscriber map in module scope, so two copies are two unconnected
    // mailboxes and nothing anywhere reports an error.
    // requiredVersion is off because workspace:* is not a matchable range.
    "@gridline/platform/bus": { singleton: true, requiredVersion: false },
  },
});
