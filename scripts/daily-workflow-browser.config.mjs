import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve("src"), "server-only": path.resolve("node_modules/server-only/empty.js") } },
  test: { environment: "node", include: ["scripts/daily-workflow-download.browser.mjs"], maxWorkers: 1, testTimeout: 10000, hookTimeout: 15000 },
});
