/* eslint-disable no-console */
//
// Manifest screenshot capture.
//
// Outputs two PNGs into `public/screenshots/` (one narrow / mobile portrait,
// one wide / desktop landscape) that Chrome shows in the rich install prompt
// on Android. Without them the prompt falls back to a generic preview — the
// difference is what the user sees the moment they tap "install".
//
// Captures from `vite preview` (the production build) rather than `vite dev`,
// so the images show the same artifacts users actually get.
//
// Pre-seeds the Zustand store via `localStorage` so the mobile mini-player is
// visible — the screenshot reads as "an audio app with content loaded" rather
// than a blank landing page.
//
// Usage: `pnpm screenshots` from `apps/web/`. The script builds, spawns
// `vite preview`, captures, and tears the server down.

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";
// We import from `@playwright/test` (already a devDep) rather than the
// standalone `playwright` package — both re-export the same chromium /
// BrowserContext APIs, and reusing the test dep avoids adding a second
// Playwright install.
import { type BrowserContext, chromium } from "@playwright/test";

const PREVIEW_URL = "http://localhost:4173";
const NOW_PLAYING_ID = "set-002-julz-lever";
const SERVER_READY_TIMEOUT_MS = 30_000;
const ANIMATION_SETTLE_MS = 1500;

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const outDir = resolve(webRoot, "public", "screenshots");

async function waitForServer(url: string, timeoutMs = SERVER_READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      // Server not up yet — keep polling.
    }
    await wait(500);
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

async function seedNowPlaying(ctx: BrowserContext, id: string) {
  // Match the persist shape from `apps/web/app/store/index.ts` (Zustand
  // wraps state in `{ state, version }`, and partialize keeps the four
  // fields listed below). Without this seed, the mini-player wouldn't
  // show — `nowPlaying` would be null on first paint.
  await ctx.addInitScript((nowPlayingId) => {
    window.localStorage.setItem(
      "format-player",
      JSON.stringify({
        state: {
          nowPlayingId,
          positions: { [nowPlayingId]: 0 },
          peaksCache: {},
          durations: {},
        },
        version: 0,
      }),
    );
  }, id);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  console.log("» starting vite preview…");
  // `pnpm start` runs `vite preview` (per package.json) — pnpm preview is
  // not a defined script. Explicit port + strictPort prevents Vite from
  // falling back to a different free port if 4173 is in use, which would
  // make `waitForServer(PREVIEW_URL)` hang.
  // Inherit stdio so server boot errors land in our terminal instead of
  // being swallowed into a useless 30-second timeout.
  const previewProc = spawn("pnpm", ["exec", "vite", "preview", "--port", "4173", "--strictPort"], {
    stdio: "inherit",
    cwd: webRoot,
  });

  try {
    await waitForServer(PREVIEW_URL);
    console.log("» preview ready, launching browser…");

    const browser = await chromium.launch();

    // Narrow — mobile portrait, captured at the home route so the
    // screenshot shows the bio + access-audio CTA + socials. Player is at
    // the bottom thanks to the localStorage seed above.
    {
      const ctx = await browser.newContext({
        viewport: { width: 540, height: 720 },
        deviceScaleFactor: 2,
      });
      await seedNowPlaying(ctx, NOW_PLAYING_ID);
      const page = await ctx.newPage();
      await page.goto(PREVIEW_URL, { waitUntil: "networkidle" });
      await wait(ANIMATION_SETTLE_MS); // let the 5s slow-fade settle a hair
      await page.screenshot({ path: resolve(outDir, "narrow.png"), fullPage: false });
      await ctx.close();
      console.log("✓ narrow.png");
    }

    // Wide — desktop landscape, captured at /sets so the catalog is the
    // hero. Two-row desktop player visible at the bottom (matches the
    // recent layout work).
    {
      const ctx = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
      });
      await seedNowPlaying(ctx, NOW_PLAYING_ID);
      const page = await ctx.newPage();
      await page.goto(`${PREVIEW_URL}/sets`, { waitUntil: "networkidle" });
      await wait(ANIMATION_SETTLE_MS);
      await page.screenshot({ path: resolve(outDir, "wide.png"), fullPage: false });
      await ctx.close();
      console.log("✓ wide.png");
    }

    await browser.close();
    console.log(`\n✓ Saved to ${outDir}`);
  } finally {
    previewProc.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
