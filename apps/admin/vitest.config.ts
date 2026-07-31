import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Standalone vitest config — mirrors apps/web's reasoning: the tanstackStart
// plugin in vite.config.ts sets up the SSR server entry, which conflicts
// with running unit tests in jsdom.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "~": resolve(__dirname, "./app") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    css: false,
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
  },
});
