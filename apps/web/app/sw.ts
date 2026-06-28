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
import { getOfflineAudio } from "~/data/offline-audio";

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

// TanStack Start server-function calls (`/_serverFn/*`): SWR so previously-
// visited route loader data survives offline. Without this, client-side
// click-nav offline rejects the loader (`fetch` fails with
// `ERR_INTERNET_DISCONNECTED`) and the route hits the error boundary —
// even though direct reloads work fine via `pages-v1`.
//
// GET only: POSTs (e.g. `/api/signal`) must fail cleanly offline until the
// Phase 4.5 beacon queue lands (TECH_DEBT 4); caching a POST response would
// be incorrect (mutation semantics) and Workbox refuses non-GET by default
// anyway.
//
// NOT cleared on activate — opposite of `pages-v1`. Reason: cached HTML can
// reference purged hashed JS chunks (hydration risk if not cleared);
// `_serverFn` data is small JSON with no asset coupling. Wiping every deploy
// would erase offline access to recently-visited pages — the wrong
// direction. URLs carry build hashes so stale entries go inert naturally.
// Same reasoning as `audio-v1` and `artwork-v1`: stable URL → don't clear.
registerRoute(
  ({ url, request }) => request.method === "GET" && url.pathname.startsWith("/_serverFn/"),
  new StaleWhileRevalidate({ cacheName: "route-data-v1" }),
);

// Audio: cross-origin R2 MP3 + peaks JSON — read-only from IDB (`audio-v1`
// database). Pass through to network on miss; the download flow in
// `offlineSlice.startDownload` is the only writer. Auto-caching is
// deliberately absent — `save_for_offline` must be an explicit user action,
// not a playback side effect.
//
// Why IDB and not Cache Storage: WebKit / iOS Safari is reliably quirky with
// large blob entries in Cache Storage. IDB has the same origin-level quota,
// no documented per-entry cap, and is the workaround the Workbox community
// recommends (GoogleChrome/workbox#3004). The synthetic Response built below
// satisfies the same Range-slicing contract regardless of storage location.
//
// Range handling: `<audio>` issues `Range: bytes=N-` for seek and for
// incremental playback. `createPartialResponse` calls `response.blob()` then
// `Blob.slice()` — slicing operates on the Blob, indifferent to how the
// Response was constructed. Only call it when a Range header is present;
// without one it throws → catches → returns a misleading 416.
//
// === Cached-Response contract (the chunk-3 §3 lock) ===
// The synthetic Response built here MUST have these five properties or Range
// slicing breaks silently:
//   status:         200  (NOT 206 — slicing a partial response would fail)
//   body:           full blob from IDB
//   Content-Type:   from `entry.contentType` ("audio/mpeg" / "application/json")
//   Content-Length: String(entry.bytesTotal)  (explicit, not the upstream header)
//   Accept-Ranges:  "bytes"
registerRoute(
  ({ url }) =>
    url.hostname === "pub-e15e86da649d4c91b6666141bfe67664.r2.dev" &&
    (url.pathname.endsWith(".mp3") || url.pathname.endsWith(".json")),
  async ({ request }) => {
    const entry = await getOfflineAudio(request.url);
    if (!entry) return fetch(request);
    const cached = new Response(entry.blob, {
      status: 200,
      headers: {
        "Content-Type": entry.contentType,
        "Content-Length": String(entry.bytesTotal),
        "Accept-Ranges": "bytes",
      },
    });
    if (!request.headers.has("range")) return cached;
    return createPartialResponse(request, cached);
  },
);

// Cross-deploy safety: clear the navigation cache on activate so we never
// serve cached HTML referencing hashed JS chunks the new deploy no longer
// ships. Without this, the first post-deploy visit would fetch JS 404s and
// fail to hydrate. The precache itself is versioned by Workbox so only
// `pages-v1` needs explicit clearing.
//
// Legacy cleanup: chunk 3a briefly used `caches.open("audio-v1")` for the
// audio read-path before chunk 3b moved storage to IDB. That left an empty
// Cache Storage cache on users running 3a — harmless but confusing in
// DevTools. Delete it on activate so post-3b installs see only the actual
// runtime caches.
self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([caches.delete("pages-v1"), caches.delete("audio-v1")]));
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
