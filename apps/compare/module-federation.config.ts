import { createModuleFederationConfig } from "@module-federation/enhanced/rspack";

export default createModuleFederationConfig({
  name: "compare",
  filename: "remoteEntry.js",

  // `window.compare` is not a browser global, so the container keeps its
  // default name. Contrast apps/navigator, which has to rename it.

  exposes: {
    "./SheetCompare": "./src/sheet-compare/index.ts",
  },

  // The shell registers this remote at runtime from mf-manifest.json.
  manifest: true,

  // Hosts hand-write the surface they expect; see apps/viewer.
  dts: false,

  // Must match the block in every other app exactly — it is the version
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
