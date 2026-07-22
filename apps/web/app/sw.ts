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
import { stripAppContext } from "~/utils/appContext";
import { AUDIO_HOST } from "~/utils/audioHost";
import { buildNotificationOptions, resolveNotificationClickUrl } from "~/utils/pushNotification";
import type { PushPayload } from "~/utils/webPush";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>;
};

// Take control of any open clients as soon as this SW activates. Without
// this, clients keep talking to the previous SW until they're closed and
// reopened — which would defeat the "new version ready [ update ]" flow we wire
// in Phase 4.2.
clientsClaim();

// NO unconditional `self.skipWaiting()` — deliberately (H2, 2026-07-02
// review). An immediately-activating SW prunes the previous build's hashed
// chunks from the precache while old clients are still running them; the old
// client's next lazy route-load then 404s, because Cloudflare Pages serves
// only the latest deployment. (The removed call's comment claimed the worst
// case was "old cache served for 30 more seconds" — the actual worst case
// was a broken route.) Instead: the new SW sits in `waiting`, the page shows
// "new version ready [ update ]" (<UpdateToast> → useSwUpdate), and activation
// happens on explicit user consent via the message below, followed by a
// reload the page itself triggers on `controllerchange`.
//
// `clientsClaim()` above STAYS: on first install there is no old client
// running hashed chunks, so claiming immediately is safe — it's what makes
// offline capability live without a reload on the very first visit.
self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

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
// === Tab vs app display-mode gate (the chunk-5 lock) ===
// The page tags playback URLs with `?ctx=app` via `withAppContext` ONLY when
// running in standalone display-mode. The marker is the SW's single source
// of truth for "is the requester a standalone PWA?":
//   - missing marker (browser tab) → pure pass-through to network. Never
//     reads IDB. A downloaded set in a tab still streams from R2.
//   - `ctx=app` (standalone) → read IDB; fall through to network on miss.
// The marker is stripped ONLY for the IDB key (via `stripAppContext`) so the
// lookup matches the bare URL the download flow stored.
//
// === Network pass-through: ALWAYS `fetch(request)`, never a rebuilt Request ===
// Both pass-through paths (tab, and standalone IDB-miss) forward the
// ORIGINAL request object. Two incidents locked this in:
//   1. Chunk 5.3: a rebuilt `new Request(url, { method, headers })` defaults
//      `mode` to "cors", silently flipping `<audio>`'s native no-cors and
//      making the browser block R2 MP3 responses. Passing `request` through
//      preserves mode / credentials / redirect by construction.
//   2. H1 (2026-07-02 review): even a rebuild that copies mode explicitly
//      loses the `Range` header — per the Fetch spec, a Headers object with
//      the "request-no-cors" guard silently drops any header that isn't
//      no-CORS-safelisted (accept / accept-language / content-language /
//      content-type), and Range isn't. Result: mid-set seeks got 200
//      full-body instead of 206, re-downloading 100MB+ sets from byte 0.
//      (Spec-derived: Node's undici doesn't implement the guard, so this is
//      only observable in a real browser — verify with the 206-on-seek check
//      in PWA_PROGRESS.)
// Consequence: on the standalone IDB-miss path the `?ctx=app` marker reaches
// R2. Verified harmless with curl against the live bucket (2026-07-02): R2
// resolves objects by path — same 200 body, and Range GETs return 206 with
// the marker present. Cost: the marked URL keys the browser HTTP cache
// separately from the bare tab URL — an acceptable duplicate-fetch, not a
// correctness issue.
//
// === Cached-Response contract (the chunk-3 §3 lock — preserved) ===
// The synthetic Response built here MUST have these five properties or Range
// slicing breaks silently:
//   status:         200  (NOT 206 — slicing a partial response would fail)
//   body:           full blob from IDB
//   Content-Type:   from `entry.contentType` ("audio/mpeg" / "application/json")
//   Content-Length: String(entry.bytesTotal)  (explicit, not the upstream header)
//   Accept-Ranges:  "bytes"
registerRoute(
  ({ url }) =>
    url.hostname === AUDIO_HOST &&
    (url.pathname.endsWith(".mp3") || url.pathname.endsWith(".json")),
  async ({ request, url }) => {
    const { ctxIsApp, bareUrl } = stripAppContext(url);

    // Tab semantics: pure pass-through, no IDB read even if an entry exists.
    // The URL carries no marker in a tab, so `request` already IS the bare
    // canonical request — see the pass-through block comment above for why
    // it must be forwarded unmodified.
    if (!ctxIsApp) return fetch(request);

    const entry = await getOfflineAudio(bareUrl);
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

// Phase 2 (2026-07-15; extended 2026-07-21 — image/vibrate/actions/
// requireInteraction/timestamp) — push notifications: receive + click-to-open.
//
// Payload shape is whatever `webPush.ts`'s `PushPayload` sends. MUST NOT
// throw: `event.data` is legitimately `null` for an empty push per spec, and
// `.json()` itself throws on non-JSON bodies — optional chaining alone only
// guards the null case, so this wraps the whole read in try/catch and falls
// back to a generic notification rather than dropping the push silently.
// `buildNotificationOptions` (pure, unit-tested — see
// `~/utils/pushNotification.ts`) owns everything payload-shaped; `tag` stays
// here because it's receipt-time state, not derivable from the payload.
self.addEventListener("push", (event) => {
  let payload: Partial<PushPayload> = {};
  try {
    payload = (event.data?.json() as Partial<PushPayload> | undefined) ?? {};
  } catch {
    // Non-JSON payload — show the generic fallback below instead of nothing.
  }

  const title = payload.title || "Form:at";
  const options = buildNotificationOptions(payload);
  // Unique per push — a constant tag would make a second announcement
  // silently REPLACE an unread first one (tag collapse, no renotify).
  // Two same-day sends (new set + new event) must both stay visible.
  options.tag = `format-${Date.now()}`;

  event.waitUntil(self.registration.showNotification(title, options));
});

// Focus-or-open, standard PWA notificationclick pattern (verified against
// MDN's `notificationclick` + `WindowClient.navigate()` references,
// 2026-07-15) — `navigate()` is what lets a tap deep-link an ALREADY-OPEN
// app to the pushed URL, not just bring an unrelated open tab to the front.
// `includeUncontrolled: true` matters here specifically: a client open from
// BEFORE this SW activated (or before `clientsClaim()` took it over) is
// still a real open window we should reuse instead of spawning a duplicate.
//
// `event.action` (2026-07-21) distinguishes a body tap from one of the two
// action buttons — verified against MDN's `NotificationEvent.action`:
// empty string for a body tap or a notification with no buttons, otherwise
// the tapped action's id. `resolveNotificationClickUrl` (pure, unit-tested)
// owns that decision; `null` means "later" was tapped — close only, the
// notification already closed above, so there's nothing left to do.
self.addEventListener("notificationclick", (event) => {
  const dataUrl = (event.notification.data as { url?: string } | undefined)?.url;
  const targetUrl = resolveNotificationClickUrl(event.action, dataUrl);
  event.notification.close();
  if (targetUrl === null) return;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const existing = clientList[0];
        if (existing) return existing.focus().then((c) => c.navigate(targetUrl));
        return self.clients.openWindow(targetUrl);
      })
      // `navigate()` rejects (TypeError) on a client this SW doesn't control
      // — and includeUncontrolled above deliberately admits those. Without
      // this fallback the tap would be swallowed entirely: the notification
      // is already closed, the rejection dies inside waitUntil, nothing
      // opens. Worst case here is a duplicate window, which beats a dead tap.
      .catch(() => self.clients.openWindow(targetUrl)),
  );
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
