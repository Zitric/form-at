import type { BeforeInstallPromptEvent } from "~/store/uiSlice";

// Pre-hydration stash for `beforeinstallprompt`. Chromium fires the event
// once per page load, and on a slow first visit it fires while the app JS is
// still downloading — long before <InstallEventsListener>'s effect can attach
// a listener. An inline head script in __root.tsx (which runs before any
// bundle) captures the event here; the React layer adopts it on mount.
// Miss the event and the install CTA stays hidden for the whole session,
// "fixing itself" on reload only because cached assets let hydration win the
// race that time.
//
// The property name is duplicated inside that inline script string — keep
// the two in sync.

declare global {
  interface Window {
    __deferredInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

export function readStashedInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  return window.__deferredInstallPrompt ?? null;
}

// Called when the prompt is consumed (.prompt() is single-use per the spec)
// or the app gets installed — a stale stashed event must not be re-adopted
// by a later mount.
export function clearStashedInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.__deferredInstallPrompt = null;
}
