import { fileURLToPath } from "node:url";

import { defineConfig } from "@rspack/cli";
import { ModuleFederationPlugin } from "@module-federation/enhanced/rspack";
import { rspack } from "@rspack/core";
import { ReactRefreshRspackPlugin } from "@rspack/plugin-react-refresh";

import mfConfig from "./module-federation.config";

const isDev = process.env.NODE_ENV === "development";

export default defineConfig({
  mode: isDev ? "development" : "production",
  entry: { main: "./src/main.tsx" },
  // See apps/viewer: this app's real entry is the federation async boundary in
  // main.tsx, a dynamic import, which lazy compilation would break.
  lazyCompilation: false,
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  output: {
    // turbo.json declares outputs: ["dist/**"]; remoteEntry.js and
    // mf-manifest.json must land here to survive a cache restore.
    path: fileURLToPath(new URL("dist", import.meta.url)),
    uniqueName: "gridline_compare",
    // Chunk URLs resolve against the script's own origin, which a remote loaded
    // from another origin needs.
    publicPath: "auto",
    clean: true,
  },
  module: {
    // `new RemoteWorker(new URL(...))` compiles its worker as a chunk, as
    // `new Worker` would; see src/changes/remote-worker.ts.
    parser: { javascript: { worker: ["RemoteWorker", "..."] } },
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
      { test: /\.css$/, type: "css/auto" },
    ],
  },
  plugins: [
    new ModuleFederationPlugin(mfConfig),
    new rspack.HtmlRspackPlugin({ template: "./src/index.html" }),
    // sources.json for standalone runs. Federated, the shell's copy answers.
    new rspack.CopyRspackPlugin({
      patterns: [{ from: "public", to: "." }],
    }),
    isDev && new ReactRefreshRspackPlugin(),
  ],
  devServer: {
    port: 4103,
    hot: true,
    // The shell on 4100 fetches this app's manifest cross-origin. In a static
    // deploy the same header comes from `serve --cors`, not from here.
    headers: { "Access-Control-Allow-Origin": "*" },
  },
});
