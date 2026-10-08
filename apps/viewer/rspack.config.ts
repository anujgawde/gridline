import { fileURLToPath } from "node:url";

import { defineConfig } from "@rspack/cli";
import { rspack } from "@rspack/core";
import { ModuleFederationPlugin } from "@module-federation/enhanced/rspack";
import { ReactRefreshRspackPlugin } from "@rspack/plugin-react-refresh";

import mfConfig from "./module-federation.config";

const isDev = process.env.NODE_ENV === "development";

export default defineConfig({
  mode: isDev ? "development" : "production",
  entry: { main: "./src/main.tsx" },
  // The CLI defaults to { entries: false, imports: true } for browser targets,
  // which defers compiling dynamic imports until they are requested. This app's
  // real entry *is* a dynamic import — the federation async boundary in
  // main.tsx — and the lazy proxy breaks the container's module registry.
  lazyCompilation: false,
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  output: {
    // turbo.json declares outputs: ["dist/**"]. remoteEntry.js and
    // mf-manifest.json must land here or a cache restore loses them.
    path: fileURLToPath(new URL("dist", import.meta.url)),
    uniqueName: "gridline_viewer",
    // Explicit because the manifest plugin reads it and warns when it is
    // undefined. "auto" resolves chunk URLs against the script's own location
    // at runtime, which is what a remote loaded from another origin needs.
    publicPath: "auto",
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "builtin:swc-loader",
          options: {
            detectSyntax: "auto",
            jsc: {
              transform: {
                react: {
                  runtime: "automatic",
                  development: isDev,
                  refresh: isDev,
                },
              },
            },
          },
        },
      },
      // Only the Tailwind entry goes through PostCSS, so every other stylesheet
      // compiles exactly as it did before Tailwind was wired.
      { test: /tailwind\.css$/, use: ["postcss-loader"], type: "css/auto" },
      { test: /\.css$/, exclude: /tailwind\.css$/, type: "css/auto" },
    ],
  },
  plugins: [
    new ModuleFederationPlugin(mfConfig),
    new rspack.HtmlRspackPlugin({ template: "./src/index.html" }),
    // Standalone, this app serves its own sheet-source lookup. Federated into
    // the shell, the relative fetch resolves against the shell's origin and the
    // shell's copy answers instead — neither is compiled into a bundle.
    new rspack.CopyRspackPlugin({
      patterns: [{ from: "public", to: "." }],
    }),
    isDev && new ReactRefreshRspackPlugin(),
  ],
  devServer: {
    port: 4101,
    hot: true,
    // The shell is served from 4100 and fetches the manifest from here, which
    // is cross-origin. Without this the failure is a CORS error at runtime.
    headers: { "Access-Control-Allow-Origin": "*" },
  },
});
