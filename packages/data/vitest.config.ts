import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// node environment, not jsdom — this package has zero DOM surface (webPush.ts
// is Web Crypto + fetch only; the sets/set-stats modules touch neither).
export default defineConfig({
  resolve: {
    alias: { "~": resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.{test,spec}.ts"],
    exclude: ["node_modules/**"],
  },
});
