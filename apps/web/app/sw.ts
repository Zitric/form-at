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
import { precacheAndRoute } from "workbox-precaching";

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
