/// <reference lib="webworker" />

// Form:at service worker — Phase 1 (installable).
//
// Single responsibility right now: precache the app shell and activate
// immediately. That's what makes Lighthouse's "registers a service worker"
// check pass and unlocks Chrome / Android's install prompt — the rest of the
// PWA capabilities (audio caching, beacon queue, update toast) are built on
// top of this minimum viable SW in later phases.
//
// Built with vite-plugin-pwa's `injectManifest` strategy: the plugin replaces
// `self.__WB_MANIFEST` at build time with the precache manifest (every emitted
// asset that matches `injectManifest.globPatterns` in vite.config.ts).
//
// Type context: `ServiceWorkerGlobalScope` from `lib: ["WebWorker"]` in
// `tsconfig.sw.json` — `Window` types are intentionally absent because the SW
// can't touch the DOM and we'd rather fail at typecheck than at runtime.

import { clientsClaim } from "workbox-core";
import { matchPrecache, precacheAndRoute } from "workbox-precaching";
import { createPartialResponse } from "workbox-range-requests";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>;
};

// Take control of any open clients as soon as this SW activates. Without
// this, clients keep talking to the previous SW until they're closed and
// reopened — which would defeat the "new build · tap to reload" flow we wire
// in Phase 4.2.
clientsClaim();

// Activate this SW the moment it finishes installing, instead of waiting for
// the old SW's clients to close. Pairs with `clientsClaim` above so updates
// land immediately. We can revisit this if we ever ship a breaking
// SW-protocol change and need a controlled rollout, but for an audio app
// where the worst case is "old cache served for 30 more seconds", immediate
// activation is the right default.
self.skipWaiting();

// Precache everything the build tags into the manifest (HTML, JS, CSS,
// fonts, the icons referenced by the manifest). Workbox handles cache
// versioning by URL revision — old entries are pruned on activate, so we
// don't leak storage across builds.
precacheAndRoute(self.__WB_MANIFEST);

// Navigation requests (SSR'd HTML): serve from cache instantly, revalidate
// in the background. Form:at's content is stable enough that "one visit
// behind" on a new set is fine, and instant loads beat fresh-on-every-nav.
// SSR semantics are preserved — these are still server-rendered docs, just
// possibly from one visit ago. Cache populates per-URL on first online visit.
registerRoute(
  ({ request }) => request.mode === "navigate",
  new StaleWhileRevalidate({ cacheName: "pages-v1" }),
);

// Artwork: same-origin `/images/*` — serve from cache instantly, revalidate
// in the background. Artwork URLs aren't content-hashed (`sets/002-1080.avif`
// stays stable across deploys even if we re-export), so SWR lets us pick up
// new exports on the next visit without breaking offline access in the
// meantime. Cache `artwork-v1` survives deploys — artwork rarely changes and
// a stale-for-one-visit image is fine, none of the JS-version-coupling that
// motivated `pages-v1`'s activate-clear applies here.
//
// Bounds: deliberately unbounded — see TECH_DEBT.md item 8. Worst case is
// ~40MB (50 sets × 4 variants × ~200KB), well within per-origin quota.
// Browser pruning under storage pressure is acceptable until observed.
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/images/"),
  new StaleWhileRevalidate({ cacheName: "artwork-v1" }),
);

// Audio: cross-origin R2 MP3 + peaks JSON — read-only from `audio-v1`. Pass
// through to network on miss; the download flow (chunk 3b) is the only
// writer to `audio-v1`. Workbox's CacheFirst would auto-cache the response
// on miss — silently saving every played set, which we explicitly don't
// want. `save_for_offline` must be a deliberate user action, not a
// playback side effect.
//
// Range handling: `<audio>` issues `Range: bytes=N-` for seek and for
// incremental playback. `createPartialResponse` slices the cached full
// 200 Response into a 206 Partial Content. Only call it when a Range
// header is present — without one it throws → catches → returns a
// misleading 416. Plain GETs (no Range) return the cached response as-is.
//
// === Cached-Response contract (the chunk-3 §3 lock) ===
// The write-path (chunk 3b) MUST produce Responses matching this exact
// shape; otherwise Range slicing breaks silently. Five properties:
//   status:         200  (NOT 206 — slicing a partial response would fail)
//   body:           full blob, complete bytes
//   Content-Type:   "audio/mpeg" for .mp3, "application/json" for peaks
//   Content-Length: String(blob.size)  (explicit, not the upstream header)
//   Accept-Ranges:  "bytes"
//
// === Hand-seed (paste in DevTools console to populate audio-v1) ===
// Produces a Response that satisfies the contract above. Use this for
// chunk 3a verification: seed, go offline, play the set, seek mid-track.
//
//   const url = "https://pub-e15e86da649d4c91b6666141bfe67664.r2.dev/002/Form_at%20002%20-%20t.i.l.mp3";
//   const r = await fetch(url);
//   const blob = await r.blob();
//   const cache = await caches.open("audio-v1");
//   await cache.put(url, new Response(blob, {
//     status: 200,
//     headers: {
//       "Content-Type": "audio/mpeg",
//       "Content-Length": String(blob.size),
//       "Accept-Ranges": "bytes",
//     },
//   }));
//   console.log("seeded", blob.size, "bytes for", url);
registerRoute(
  ({ url }) =>
    url.hostname === "pub-e15e86da649d4c91b6666141bfe67664.r2.dev" &&
    (url.pathname.endsWith(".mp3") || url.pathname.endsWith(".json")),
  async ({ request }) => {
    const cache = await caches.open("audio-v1");
    const cached = await cache.match(request.url);
    if (!cached) return fetch(request);
    if (!request.headers.has("range")) return cached;
    return createPartialResponse(request, cached);
  },
);

// Cross-deploy safety: clear the navigation cache on activate so we never
// serve cached HTML referencing hashed JS chunks the new deploy no longer
// ships. Without this, the first post-deploy visit would fetch JS 404s and
// fail to hydrate. The precache itself is versioned by Workbox so only
// `pages-v1` needs explicit clearing.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete("pages-v1"));
});

// Last-resort fallback when nothing else handled the request — no cached
// entry AND network failed. Use `matchPrecache` instead of
// `createHandlerBoundToURL`: the latter runs the PrecacheStrategy which has
// `fallbackToNetwork: true` by default, so a cache miss triggers a network
// fetch that fails offline — defeating the whole point of an offline
// fallback. `matchPrecache` is a direct cache lookup, no network involved.
setCatchHandler(async (options) => {
  if (options.request.mode === "navigate") {
    const cached = await matchPrecache("/offline.html");
    if (cached) return cached;
  }
  return Response.error();
});
