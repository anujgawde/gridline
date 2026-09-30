import { defineConfig } from "@playwright/test";

/* Performance specs only. They measure a running production build served by a
   static file server, which is why nothing here starts a server: `pnpm serve`
   requires `pnpm build` first and deliberately never triggers one, so a spec
   that started its own could measure bytes nobody has looked at.

   Run `pnpm build && pnpm serve` in one terminal, then `pnpm perf` in another. */
export default defineConfig({
  testDir: "tests/perf",
  // Measurement, not coverage: parallel workers compete for the same CPU and
  // every number would be a number about that competition.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4100",
    headless: true,
    viewport: { width: 1600, height: 1000 },
  },
});
