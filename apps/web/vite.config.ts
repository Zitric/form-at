import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { build as esbuild } from "esbuild";
import { visualizer } from "rollup-plugin-visualizer";
import { type Plugin, defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// __dirname isn't available — `apps/web/package.json` is `"type": "module"`,
// so Vite loads this config as ESM.
const __dirname = dirname(fileURLToPath(import.meta.url));

// Replaces vite-plugin-pwa. We bundle `app/sw.ts` ourselves with esbuild on
// `closeBundle` of the client build, then inject a precache manifest into the
// resulting bundle so Workbox knows which app-shell assets to cache. Custom
// because vite-plugin-pwa@1.x doesn't cope with TanStack Start's dual-environment
// Vite build — it emits the registration snippet into the SSR output and never
// produces the actual `/sw.js` file (see the Phase 1 audit notes for the dig).
//
// Output: `dist/client/sw.js` — a single bundled file with all Workbox imports
// inlined. Classic worker (iife), not a module worker, for broadest browser
// support (Safari only added module workers in 15.4).
function buildServiceWorker(): Plugin {
  const SW_SOURCE = resolve(__dirname, "app/sw.ts");
  const CLIENT_DIR = resolve(__dirname, "dist/client");

  // Explicit allowlist for what goes into the precache. Everything not matched
  // is skipped — safer than "everything minus media" because new files dropped
  // into `public/` later won't quietly bloat the precache budget. Runtime
  // caches in Phase 3 handle artwork and audio with dedicated strategies.
  function shouldPrecache(rel: string): boolean {
    if (rel === "manifest.json") return true;
    if (rel === "icon-192.png" || rel === "icon-512.png") return true;
    if (rel === "wordmark.png" || rel === "logo.png") return true;
    if (rel === "index.html") return true;
    if (rel === "offline.html") return true;
    if (rel.startsWith("assets/") && /\.(js|css)$/.test(rel)) return true;
    if (rel.startsWith("fonts/")) return true;
    return false;
  }

  return {
    name: "form-at:sw",
    apply: "build",
    // Run only during the client build. The SSR pass would emit nothing useful
    // and would race with the client pass writing to `dist/client/sw.js`.
    applyToEnvironment(env) {
      return env.name === "client";
    },
    async closeBundle() {
      // Belt-and-braces: even with applyToEnvironment above, if a future Vite
      // version drops or renames the hook we'd still skip the SSR pass.
      if (this.environment?.name !== "client") return;

      const entries: { url: string; revision: string | null }[] = [];
      async function walk(dir: string) {
        for (const name of await readdir(dir)) {
          const full = resolve(dir, name);
          const st = await stat(full);
          if (st.isDirectory()) {
            await walk(full);
            continue;
          }
          const rel = relative(CLIENT_DIR, full).split("\\").join("/");
          if (!shouldPrecache(rel)) continue;
          // Content-hashed Vite assets (`assets/foo-AbCd1234.js`) need no
          // revision — their hash IS the cache-bust signal. Everything else
          // gets the mtime as a cheap revision token. Character class
          // includes `_` and `-` because Vite uses base64url for hashes
          // (e.g. `SocialLink-DNCRpP_a.js`, `_eventId-B-zz1u4r.js`); without
          // those, ~25% of assets fall back to mtime and re-download on
          // every deploy even when their content hasn't changed.
          const revision = /-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(rel) ? null : st.mtimeMs.toString();
          entries.push({ url: `/${rel}`, revision });
        }
      }
      await walk(CLIENT_DIR);

      await mkdir(CLIENT_DIR, { recursive: true });
      await esbuild({
        entryPoints: [SW_SOURCE],
        bundle: true,
        format: "iife",
        platform: "browser",
        target: "es2022",
        outfile: resolve(CLIENT_DIR, "sw.js"),
        define: {
          "self.__WB_MANIFEST": JSON.stringify(entries),
        },
        minify: true,
        legalComments: "none",
      });

      console.log(`[form-at:sw] bundled sw.js with ${entries.length} precache entries`);
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackStart({ srcDirectory: "app", server: { entry: "server.ts" } }),
    react({ babel: { plugins: [["babel-plugin-react-compiler", {}]] } }),
    tailwindcss(),
    tsConfigPaths(),
    buildServiceWorker(),
    process.env.ANALYZE ? visualizer({ open: true, gzipSize: true, brotliSize: true }) : null,
  ],
});
