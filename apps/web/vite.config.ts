import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackStart({ srcDirectory: "app", server: { entry: "server.ts" } }),
    react({ babel: { plugins: [["babel-plugin-react-compiler", {}]] } }),
    tailwindcss(),
    tsConfigPaths(),
    // PWA: we own `public/manifest.json` and `app/sw.ts`. The plugin handles
    // the precache-manifest injection (replaces `self.__WB_MANIFEST` in our SW
    // at build time), the client-side registration script, and the
    // dev-mode SW (so Lighthouse-on-localhost gives us a representative
    // result without needing a production build first).
    //   - injectManifest:    we author the SW source ourselves (vs. the
    //                        `generateSW` strategy where the plugin generates
    //                        one from a config). Gives full control over the
    //                        caching strategies we'll add in Phase 3.
    //   - manifest: false:   keep our existing `public/manifest.json` —
    //                        without this the plugin emits its own manifest
    //                        and overrides our handcrafted one.
    //   - registerType:
    //     'autoUpdate':      the registration script polls for new SWs, and
    //                        fires `needRefresh` when one is waiting. We
    //                        consume that signal in Phase 4.2 for the
    //                        "new build · tap to reload" toast.
    //   - injectRegister:
    //     'auto':            the plugin injects the SW registration into the
    //                        emitted HTML automatically.
    VitePWA({
      strategies: "injectManifest",
      srcDir: "app",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: false,
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,webp,woff,woff2}"],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
    process.env.ANALYZE ? visualizer({ open: true, gzipSize: true, brotliSize: true }) : null,
  ],
});
