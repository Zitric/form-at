import { defineConfig } from "vitest/config";

// Standalone, like apps/web's — no Worker runtime needed, because the capture
// logic takes its D1 and fetch dependencies as arguments and is tested with
// fakes rather than against a live binding.
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
