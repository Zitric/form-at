import type { StateCreator } from "zustand";
import type { MusicSet } from "~/data/sets";

// Subset of the experimental BeforeInstallPromptEvent spec we actually touch.
// Not in lib.dom.d.ts because the API is Chromium-only and not in the WHATWG
// spec yet — own the type locally so we don't depend on a globally-augmented
// declaration that could conflict elsewhere.
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type UiSlice = {
  toast: string | null;
  setToast: (msg: string | null) => void;
  /** The set whose share modal is currently open. `null` means the modal is
   * closed. Storing the set itself rather than just the id avoids a lookup
   * from inside <ShareModal>. */
  shareSet: MusicSet | null;
  openShareModal: (set: MusicSet) => void;
  closeShareModal: () => void;
  /** Mobile full-screen "now playing" overlay open/closed flag. Mini-player
   *  tap sets this true; close button + route changes set it false.
   *  <FullPlayer> renders null when this is true but `nowPlaying` is null,
   *  so the overlay can't end up empty if something opens it racily. */
  fullPlayerOpen: boolean;
  openFullPlayer: () => void;
  closeFullPlayer: () => void;
  /** True once `appinstalled` has fired in any session, OR the user
   *  self-reported install via the iOS-Safari instruction modal. Persisted
   *  so we remember across visits that the app lives on the home screen
   *  even when launched from a regular browser tab (where `isStandalone()`
   *  reads false). */
  pwaInstalled: boolean;
  /** True if the user closed the install modal without installing. Persisted
   *  — Phase 3 design decision was "soft dismiss".
   *
   *  IMPORTANT — two consumers, two different semantics:
   *   - <InstallCta> on the home page: a passive CTA. When this flag is true,
   *     the button is HIDDEN entirely. The user said "not now"; we respect
   *     it by removing the passive nudge.
   *   - <SaveForOfflineButton> on /sets/:setId: a user-initiated action. The
   *     button stays VISIBLE and TAPPABLE regardless of this flag. A
   *     deliberate user tap always reopens the install modal — the flag
   *     only suppresses any future *automatic / passive* prompting we might
   *     add later. No dead buttons. */
  pwaInstallDismissed: boolean;
  /** Captured `beforeinstallprompt` event held in memory for InstallCta and
   *  SaveForOfflineButton to call `.prompt()` on. **Not persisted** — the
   *  event has a native ref and methods that don't round-trip through JSON.
   *  Re-captured on each page load when Chrome decides to fire it. */
  deferredPrompt: BeforeInstallPromptEvent | null;
  /** Push-notification opt-in, spent-native-ask flag (Phase 2, 2026-07-15;
   *  semantics narrowed 2026-07-18). Its OWN flag rather than reusing
   *  `pwaInstallDismissed` (installing the app and opting into push are
   *  different asks; a "not now" on one shouldn't silently answer the
   *  other). Set to true after ANY `Notification.requestPermission()`
   *  outcome that isn't `"granted"`.
   *
   *  NOT a source of truth — live `Notification.permission` is, and it can
   *  change outside the app entirely (Android app settings, Chrome site
   *  settings, permission resets). <PushOptInCta> reconciles on mount: the
   *  flag only keeps suppressing while live permission is still "denied";
   *  any other live value means it's stale and it gets cleared (field bug
   *  2026-07-18 — a Block later undone in Android settings had locked the
   *  CTA out forever). Net effect per case:
   *   - explicit Block → hidden while denied; external re-enable un-hides.
   *   - native prompt dismissed without choosing (permission stays
   *     "default") → suppression for the rest of THIS session only, CTA
   *     returns next visit. The original "hide forever, or we'd re-prompt
   *     on every visit" rationale predates the soft prompt — the CTA now
   *     opens our own modal, so a returning CTA no longer nags with the
   *     native dialog. */
  pushOptInDismissed: boolean;
  /** Declined the push soft-prompt modal this SESSION (closed it, or tapped
   *  "not now", without accepting). Deliberately NOT persisted — a third
   *  suppression tier between the other two:
   *   - `pushOptInDismissed` (persisted, forever) is reserved for a spent
   *     NATIVE permission ask — once the browser prompt was declined,
   *     re-nudging is pointless (the browser blocks re-prompting) or nagging.
   *   - This flag covers declining OUR soft prompt, which is exactly the
   *     recoverable "not now" the soft-prompt pattern exists to preserve:
   *     hiding the CTA for the rest of the session respects the no, and
   *     letting it return next visit keeps the ask alive for a "not now"
   *     that meant *not now*. Persisting it would recreate the
   *     near-unrecoverable state the modal was built to avoid.
   *  In-memory store state resets on page load, which IS the session scope. */
  pushOptInDeclinedSession: boolean;
  setPwaInstalled: (v: boolean) => void;
  setPwaInstallDismissed: (v: boolean) => void;
  setDeferredPrompt: (e: BeforeInstallPromptEvent | null) => void;
  setPushOptInDismissed: (v: boolean) => void;
  setPushOptInDeclinedSession: (v: boolean) => void;
};

export const createUiSlice: StateCreator<UiSlice, [], [], UiSlice> = (set) => ({
  toast: null,
  setToast: (msg) => set({ toast: msg }),
  shareSet: null,
  openShareModal: (s) => set({ shareSet: s }),
  closeShareModal: () => set({ shareSet: null }),
  fullPlayerOpen: false,
  openFullPlayer: () => set({ fullPlayerOpen: true }),
  closeFullPlayer: () => set({ fullPlayerOpen: false }),
  pwaInstalled: false,
  pwaInstallDismissed: false,
  deferredPrompt: null,
  pushOptInDismissed: false,
  pushOptInDeclinedSession: false,
  setPwaInstalled: (v) => set({ pwaInstalled: v }),
  setPwaInstallDismissed: (v) => set({ pwaInstallDismissed: v }),
  setDeferredPrompt: (e) => set({ deferredPrompt: e }),
  setPushOptInDismissed: (v) => set({ pushOptInDismissed: v }),
  setPushOptInDeclinedSession: (v) => set({ pushOptInDeclinedSession: v }),
});
