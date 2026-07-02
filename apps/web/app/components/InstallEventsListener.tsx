import { useEffect } from "react";
import { useStore } from "~/store";
import type { BeforeInstallPromptEvent } from "~/store/uiSlice";
import { clearStashedInstallPrompt, readStashedInstallPrompt } from "~/utils/installPromptStash";
import { safeLocal } from "~/utils/safeStorage";

// Global capture of the two PWA install lifecycle events. Rendered once in
// __root — null render, just runs effects on mount.
//
// Why one listener pair globally (not per-component): both <InstallCta> (home)
// and <SaveForOfflineButton> (/sets/:setId) need the captured
// `beforeinstallprompt` event to call `.prompt()` on. Capturing it twice in
// two components would mean only whichever mounted second sees it — the
// first listener consumed-and-stored it locally. Capturing once into the
// store and reading from both consumers keeps them in sync.
//
// Also performs a one-time migration of Phase 1's localStorage dismiss key
// into the new persisted `pwaInstallDismissed` flag so a returning user who
// said "not now" before isn't re-prompted after this refactor lands.
export function InstallEventsListener() {
  const setDeferredPrompt = useStore((s) => s.setDeferredPrompt);
  const setPwaInstalled = useStore((s) => s.setPwaInstalled);
  const setPwaInstallDismissed = useStore((s) => s.setPwaInstallDismissed);

  useEffect(() => {
    // safeLocal handles private-mode Safari / partitioned-iframe throws
    // internally with a silent fallback. If the read throws → returns null →
    // comparison fails → migration skipped. If the remove throws → no-op.
    // Either way no crash, worst case is the user sees the install button
    // once more (the migration just retries on next load and likely succeeds).
    if (safeLocal.get("install-dismissed") === "1") {
      setPwaInstallDismissed(true);
      safeLocal.remove("install-dismissed");
    }

    // Adopt a prompt that fired before this effect could listen — the inline
    // head script in __root stashes it (see installPromptStash.ts). Chromium
    // fires beforeinstallprompt once per page load; on first visits it
    // reliably beats React hydration.
    const stashed = readStashedInstallPrompt();
    if (stashed) setDeferredPrompt(stashed);

    const onBeforeInstall = (e: Event) => {
      // Chrome would otherwise show its own mini-infobar; we want control.
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPwaInstalled(true);
      setDeferredPrompt(null);
      clearStashedInstallPrompt();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [setDeferredPrompt, setPwaInstalled, setPwaInstallDismissed]);

  return null;
}
