import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Standalone vitest config — does NOT use the tanstackStart plugin from
// vite.config.ts. That plugin sets up the SSR server entry which conflicts
// with running unit tests in jsdom. Tests render components in isolation.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "~": resolve(__dirname, "./app") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    css: false,
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
  },
});
