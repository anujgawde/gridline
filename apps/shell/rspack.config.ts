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
  // See apps/viewer: the CLI lazily compiles dynamic imports for browser
  // targets, and this app's real entry is the federation async boundary in
  // main.tsx, which is a dynamic import.
  lazyCompilation: false,
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  output: {
    // turbo.json declares outputs: ["dist/**"], so anything emitted outside
    // dist/ is dropped when Turborepo restores this task from cache.
    path: fileURLToPath(new URL("dist", import.meta.url)),
    uniqueName: "gridline_shell",
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
      // Rspack 2 removed experiments.css: CSS is built in, but the rule is not.
      { test: /\.css$/, type: "css/auto" },
    ],
  },
  plugins: [
    new ModuleFederationPlugin(mfConfig),
    new rspack.HtmlRspackPlugin({ template: "./src/index.html" }),
    isDev && new ReactRefreshRspackPlugin(),
  ],
  devServer: {
    port: 4100,
    hot: true,
  },
});
