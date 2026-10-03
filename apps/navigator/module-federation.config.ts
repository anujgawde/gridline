import { createModuleFederationConfig } from "@module-federation/enhanced/rspack";

export default createModuleFederationConfig({
  name: "navigator",
  filename: "remoteEntry.js",

  // The container is published as a global named after the remote by default,
  // and `window.navigator` already belongs to the browser: the runtime then
  // reads the browser's Navigator object and fails with RUNTIME-002 ("does not
  // contain init"). Only the global is renamed; the remote is still "navigator".
  library: { type: "global", name: "gridline_navigator" },

  exposes: {
    "./SetNavigator": "./src/set-navigator/index.ts",
  },

  // The shell registers this remote at runtime from mf-manifest.json.
  manifest: true,

  // Hosts hand-write the surface they expect; see apps/viewer.
  dts: false,

  // Must match the shell's and the viewer's block exactly — it is the version
  // contract between the apps. See apps/viewer for why requiredVersion is
  // explicit and why the trailing-slash keys are required.
  shared: {
    react: { singleton: true, requiredVersion: "^19.3.0" },
    "react/": { singleton: true, requiredVersion: "^19.3.0" },
    "react-dom": { singleton: true, requiredVersion: "^19.3.0" },
    "react-dom/": { singleton: true, requiredVersion: "^19.3.0" },
    "@gridline/platform/bus": { singleton: true, requiredVersion: false },
  },
});
