import { useEffect, useRef, useState } from "react";

// Subset of the experimental BeforeInstallPromptEvent spec we actually touch.
// Not in lib.dom.d.ts because the API is Chromium-only and not in the WHATWG
// spec yet — own the type locally so we don't depend on a globally-augmented
// type declaration that could conflict elsewhere.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "install-dismissed";

// "Install Form:at" CTA on the home route.
//
// Chromium fires `beforeinstallprompt` when its PWA install heuristics decide
// the user qualifies (engagement + manifest + service worker). We intercept
// it to surface our own button instead of waiting for Chrome's address-bar
// install icon — gives Form:at a discoverable install path on Android Chrome
// and desktop Chrome / Edge.
//
// Platform reality (per CLAUDE memory: platform asymmetry honesty):
//   - Android Chrome / Edge / desktop Chrome:  prompt fires → we render → tap → native dialog.
//   - iOS Safari:                              no `beforeinstallprompt` event exists. Install is
//                                              Share → Add to Home Screen. The CTA stays hidden;
//                                              the Phase 2 InAppBrowserBanner + Phase 4.1 splash
//                                              cover iOS UX separately.
//   - Firefox:                                 no install prompt API. CTA stays hidden.
//
// Dismissal is persisted to localStorage so a user who clicked "no" once
// doesn't see the button every visit. They can still install via Chrome's
// own UI if they change their mind.
export function InstallCta({ className }: { className?: string }) {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(true); // SSR-safe default; effect re-reads

  useEffect(() => {
    // Pull the dismiss flag once on mount. SSR runs with `dismissed: true`
    // so the CTA stays hidden on the first paint regardless of localStorage —
    // matches the post-mount value on the client when nothing's been dismissed
    // because we *also* gate on `available`, which is false on first paint.
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // localStorage can throw in private-mode Safari / cross-site iframes —
      // fall back to "not dismissed", the UX cost is one extra render of the
      // button per visit which is fine.
      setDismissed(false);
    }

    const onBeforeInstall = (e: Event) => {
      // Chrome will otherwise show its own mini-infobar; we want full control.
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setAvailable(true);
    };

    const onInstalled = () => {
      // Hide ourselves after install — even if the user lands on / again
      // through the new shortcut, the standalone display mode kicks in and
      // the CTA shouldn't be there to confuse anyone.
      setAvailable(false);
      deferredPromptRef.current = null;
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!available || dismissed) return null;

  const handleClick = async () => {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "dismissed") {
      try {
        window.localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        // Failing to persist dismissal is a worse UX than failing to install,
        // but not by enough to surface anything. Silent skip.
      }
      setDismissed(true);
    }
    // Accepted path triggers `appinstalled` which clears `available` for us.
    // The deferred event is single-use per Chrome's spec, so null it either way.
    deferredPromptRef.current = null;
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ??
        "text-sm text-grey hover:text-white transition-colors tracking-widest cursor-pointer"
      }
    >
      [ install_form:at ]
    </button>
  );
}
