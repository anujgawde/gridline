import { fileURLToPath } from "node:url";

import { defineConfig } from "@rspack/cli";
import { rspack } from "@rspack/core";
import { ReactRefreshRspackPlugin } from "@rspack/plugin-react-refresh";

const isDev = process.env.NODE_ENV === "development";

export default defineConfig({
  mode: isDev ? "development" : "production",
  entry: { main: "./src/main.tsx" },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  output: {
    // turbo.json declares outputs: ["dist/**"], so anything emitted outside
    // dist/ is dropped when Turborepo restores this task from cache.
    path: fileURLToPath(new URL("dist", import.meta.url)),
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
    new rspack.HtmlRspackPlugin({ template: "./src/index.html" }),
    isDev && new ReactRefreshRspackPlugin(),
  ],
  devServer: {
    port: 4100,
    hot: true,
  },
});
