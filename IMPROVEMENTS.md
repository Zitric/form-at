# Form:at — Improvements

Running list of feature/functional improvements. Tick off as we ship.

## Quick wins

- [x] **#1 — Autoplay next set on end**
  Already implemented in `apps/web/app/hooks/useAudioPlayer.ts` (`onEnded`). When a set ends, the player advances to the next set in `sets[]` and starts playback.

- [x] **#2 — Sharing (deeplink timestamps + share modal)**
  Goal: match the SoundCloud/Mixcloud sharing pattern so listeners actively pass sets around.
  - `?t=<seconds>` URL support: `/sets/<id>?t=1234` jumps to that moment on play.
  - Custom `ShareModal` opened from the set detail page (`[ share_set ]`) and from share icons on each set card. Options: `copy_link`, `copy @ MM:SS` (when this set is playing past 3s), `whatsapp`, `twitter`, `telegram`, `email`.
  - `Toast` system (slides up/down) confirms successful copy.
  - Later: small share icon in the player bar so listeners can share without leaving the audio.

- [x] **#3 — Continue listening card on home**
  We already persist `nowPlayingId` + `positions`. Surface a top card on `/` that resumes the last set in one tap when those are present.
  Shipped, but not as a separate card: `routes/index.tsx`'s existing main CTA button relabels itself to `resume_signal` and calls `playTrack(nowPlaying)` when a paused `nowPlaying` set exists, `access_audio` otherwise — same one-tap-resume outcome, folded into the CTA rather than a distinct component.

- [x] **#4 — Add to calendar on events**
  `AddToCalendarButton` builds an RFC 5545 `.ics` (TZID=Europe/London) from `event.date / runtime / venue` and triggers a download. Shown on upcoming events only. Util: `apps/web/app/utils/ics.ts`.

## Medium lift, high engagement

- [ ] **#5 — Tracklist / chapters on set pages**
  Add `tracks: [{ time, artist, title }]` to `MusicSet`. Render clickable rows that seek to that moment. Industry standard for DJ mixes; big dwell-time boost.

- [ ] **#6 — Sleep timer + speed control**
  Player additions: 15/30/60-min sleep, 0.75x/1x/1.25x speed. Common asks for long mixes.

- [ ] **#7 — "Shuffle the archive" / random set**
  One button on `/sets` (and maybe `/`) that picks a random set and plays it. Fits the explore vibe.

- [ ] **#11 — Search/filter input for the sets catalogue**
  Not needed yet — same revisit trigger PWA_PROGRESS.md already uses for the deferred manage-offline-sets view: earns its place once the catalogue grows past ~10-15 sets, where scanning every card becomes a chore. At today's 4 sets, scanning is still instant. Placeholder so it isn't lost once the next few batches land.
  **Context update (2026-08-04):** this threshold used to require someone manually running a migration/seed script to add a set. Now that `apps/admin` has a self-serve upload form (PR4, 2026-07), adding a set is a few form fields and a click — the same trigger condition arrives much sooner than when this was written, on whatever cadence Julian actually uploads at rather than an engineering-effort-gated one.

## Bigger but worth it

- [ ] **#8 — Full PWA (install + share routing + offline + polish)**
  Manifest is already in place. Take Form:at from "web app with a manifest" to a real installable PWA with native-app-quality UX. Four phases.

  **Status (verified against the actual code, 2026-08-04): Phases 1-3 fully shipped. Phase 4 partial** — 1 of 5 items done.

  ### Phase 1 — Make it installable ✅ shipped
  - Audit `manifest.json`: `start_url`, `scope`, `display: "standalone"`, `theme_color`, `background_color`, icons (192 + 512 maskable).
  - Register a minimal service worker (just registering it unlocks the Android "Add to Home Screen" prompt — caching comes later).
  - Add an in-app "Install Form:at" CTA on `/` that calls `beforeinstallprompt`.
  - Lighthouse PWA audit → green.
  - **Outcome**: phone shows install prompt; tap → Form:at home-screen icon, launches in standalone mode (no URL bar, no tabs). Feels like a real audio app.
  - _Confirmed: `public/manifest.json` has every field listed above plus `launch_handler`; `app/utils/rootHead.ts` registers the SW; `InstallCta.tsx` + `installCapability.ts`/`installPromptStash.ts` handle the `beforeinstallprompt` capture/CTA flow._

  ### Phase 2 — Shared links open the PWA, not the in-app browser ✅ shipped
  - **Android**: with the PWA installed + "Open supported links" enabled (Chrome auto-prompts post-install), taps on `formatglasgow.com` links from Instagram / WhatsApp / wherever open directly inside our PWA, bypassing the in-app browser. Automatic once WebAPK criteria are met.
  - **iOS**: Apple is stricter — taps from IG still go through IG's in-app browser by default. Two mitigations:
    - `launch_handler: { client_mode: "navigate-existing" }` in manifest so future taps land in the same PWA window.
    - In-app-browser detection banner ("Open in Safari for the full experience") that fires only when `userAgent` matches Instagram / TikTok / Facebook.
  - **Outcome**: Android share links open inside the PWA with our lock-screen player and our branding. iOS gets a one-tap escape hatch from the in-app browser.
  - _Confirmed: `manifest.json`'s `launch_handler` is in place; `app/utils/inAppBrowser.ts` + `InAppBrowserBanner.tsx` implement the UA-sniffed banner._

  ### Phase 3 — Offline caching (the original #8) ✅ shipped
  - App shell: cache HTML / JS / CSS / fonts. Repeat visits start instantly even with no signal.
  - Artwork: pre-cache all variants on first visit (small, fast).
  - Audio: explicit `[ save_for_offline ]` button per set caches the MP3 from R2 into Cache Storage. `[ saved · 64MB ]` indicator.
  - Download icon on `/sets` list cards. Each card currently has share + play but no download affordance. Once `save_for_offline` actually downloads audio (this phase), add a per-card download icon that saves the set offline directly from the list without entering the detail page — and have it reflect state (not-saved / downloading / saved, pairing with the `[ saved · 64MB ]` indicator). Deliberately deferred from Phase 3: while `save_for_offline` only triggers install (no real download yet), a download icon on the list would promise a direct download it can't deliver and read as a broken promise. It only becomes honest once the button actually caches the MP3.
  - Beacon queue: if a play happens offline, queue the `/api/signal` POST and replay via Background Sync. No analytics lost.
  - **Outcome**: train, underground, festival Wi-Fi — saved sets just play.
  - _Confirmed: `sw.ts` precaches the app shell (`workbox-precaching`) and runs a `StaleWhileRevalidate` `artwork-v1` route (caches-as-visited rather than a proactive prefetch-everything pass, but the same offline-availability outcome once a set's been viewed); `SaveForOfflineButton.tsx` + `SaveForOfflineIconButton.tsx` (the latter wired into `SetCard.tsx`'s list rows) cover the button and the list-card download affordance; `beacon-queue.ts`'s `SYNC_TAG` + `sw.ts`'s `sync` listener cover Background Sync replay._

  ### Phase 4 — Polish (partial — 0/5 shipped)
  - [ ] Per-device splash screens (iOS especially). Not found in the codebase.
  - [~] ~~Update notification when a new deploy is live ("new build — tap to reload").~~ **Shipped, then deliberately removed — do not re-propose.** `UpdateToast` interrupted the very session it was meant to protect, and any prompt-or-reload variant reintroduces the mid-playback-cutoff failure it was built to avoid. New builds now activate silently on the next cold start. Full rationale and the accepted trade-off (an indefinitely-open client stays on the old version) in PWA_PROGRESS.md's "SW update flow" section.
  - [ ] iOS heartbeat so the PWA doesn't get evicted by the 14-day storage cleanup. Not found in the codebase.
  - [ ] "Manage offline sets" view (storage used, per-set remove). Not shipped — deferred, coupled to TECH_DEBT.md item 16 (orphan-artwork prune ships alongside it). See that item for the (now-accelerated) revisit trigger.
  - [ ] **FullPlayer header layout for iOS PWA standalone mode.** Currently the overlay's header pads itself by `safe-area-inset-top + 1.5rem`, which is the safe default everywhere. In a true iOS PWA-installed context with a notch / Dynamic Island, the more native pattern is to put `› now_playing` on the **left of the island** and `[ × ]` on the **right of the island** with the island filling the gap — like the iOS status bar layout. Requires `viewport-fit=cover`, detection via `window.matchMedia('(display-mode: standalone)')`, and horizontal offsets that clear the system time / indicators (≈5rem each side). Degrades cleanly to current behaviour outside PWA mode. Skipped during Phase 2.5 of the player work because we're not on the PWA install path yet — revisit during this phase. Still true as of 2026-08-04: `FullPlayer.tsx`'s header is still the plain `safe-area-inset-top + 1.5rem` padding, no `matchMedia`/island-aware split.

  ### Recommended order
  Phase 1 first (huge UX win, low risk). Then Phase 2 (directly addresses the Instagram → in-app browser pain). Then Phase 3 (the meaty one). Phase 4 is polish — whenever it bothers us.

  ### Honest trade-offs
  - **Wins**: free distribution channel; home-screen presence creates ownership; lock-screen player becomes first-class; Android shared links route into the PWA; offline listening is a real retention hook.
  - **Costs**: iOS support is second-class; iOS evicts storage after ~14 days of inactivity (can wipe offline sets); service worker adds a cache-staleness failure mode; install discovery on iOS is brutal (no automatic prompt — has to be in the Share sheet).

- [ ] **#9 — Per-DJ stats**
  Aggregate plays and top territories on `/djs/:id`. D1 already has the data — just a new server fn.

- [ ] **#10 — Native-app handoff for social links on iOS**
  Android already opens the native app via `intent://` URLs (see `utils/deeplink.ts`). iOS currently relies on Apple's Universal Links — works for major platforms (Instagram, Spotify, SoundCloud) but only when the user hasn't told iOS to keep links in Safari. Add a best-effort iOS path:
  - On `iPhone|iPad|iPod` UA + a known platform handle, try the app URL scheme (`instagram://user?username=…`, `spotify:user:…`, `twitter://user?screen_name=…`).
  - Use a `visibilitychange` listener as fallback: if the page becomes hidden within ~1.5s, the app opened — cancel fallback. Otherwise navigate to the web URL.
  - **Trade-offs**: Apple has been hostile to URL schemes; some apps drop them; false-fire fallbacks happen if the user returns to the page quickly. Acceptable risk for major platforms, but not worth doing for every social. Pair with PWA install onboarding (Phase 1 / 2 of #8) for the best overall iOS story.
