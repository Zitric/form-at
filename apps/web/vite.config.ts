import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackStart({ srcDirectory: "app", server: { entry: "server.ts" } }),
    react({ babel: { plugins: [["babel-plugin-react-compiler", {}]] } }),
    tailwindcss(),
    tsConfigPaths(),
    process.env.ANALYZE ? visualizer({ open: true, gzipSize: true, brotliSize: true }) : null,
  ],
});
