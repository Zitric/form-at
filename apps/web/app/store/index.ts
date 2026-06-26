import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getSet } from "~/data/sets";
import { type OfflineSetState, type OfflineSlice, createOfflineSlice } from "./offlineSlice";
import { type PlayerSlice, createPlayerSlice } from "./playerSlice";
import { type UiSlice, createUiSlice } from "./uiSlice";

export type AppStore = PlayerSlice & UiSlice & OfflineSlice;

export const useStore = create<AppStore>()(
  persist(
    (...a) => ({
      ...createPlayerSlice(...a),
      ...createUiSlice(...a),
      ...createOfflineSlice(...a),
    }),
    {
      name: "format-player",
      // Wait until <HydrateStore> mounts before reading localStorage. Without this,
      // SSR (no localStorage → empty) and the first client render (synchronous
      // localStorage read → restored track) disagree, and React's reconciliation
      // produces a visible re-render of the player.
      skipHydration: true,
      partialize: (state) => ({
        nowPlayingId: state.nowPlaying?.id ?? null,
        positions: state.positions,
        peaksCache: state.peaksCache,
        durations: state.durations,
        // PWA install state — both booleans persisted so a returning user is
        // remembered as installed-or-dismissed across visits. `deferredPrompt`
        // is DELIBERATELY OMITTED: it's a non-serializable BeforeInstallPrompt
        // event with native methods (`.prompt()`, `.userChoice`) that would
        // either crash JSON.parse or yield a useless plain object on rehydrate.
        // The event is re-captured each page load when Chrome fires it.
        pwaInstalled: state.pwaInstalled,
        pwaInstallDismissed: state.pwaInstallDismissed,
        // Offline: persist ONLY confirmed-saved entries + the "first save
        // already requested persistent storage" flag. Mid-download state,
        // failures, and evictions are ephemeral — reconciled at boot from
        // IDB. A reload during a download = aborted (correct semantics).
        offlineSets: Object.fromEntries(
          Object.entries(state.offlineSets).filter(([, s]) => s.status === "saved"),
        ),
        hasRequestedPersist: state.hasRequestedPersist,
      }),
      merge: (persisted, current) => {
        const {
          nowPlayingId,
          positions,
          peaksCache,
          durations,
          pwaInstalled,
          pwaInstallDismissed,
          offlineSets,
          hasRequestedPersist,
        } = persisted as {
          nowPlayingId: string | null;
          positions: Record<string, number>;
          peaksCache: Record<string, number[]>;
          durations: Record<string, number>;
          pwaInstalled?: boolean;
          pwaInstallDismissed?: boolean;
          offlineSets?: Record<string, OfflineSetState>;
          hasRequestedPersist?: boolean;
        };
        return {
          ...current,
          nowPlaying: nowPlayingId ? (getSet(nowPlayingId) ?? null) : null,
          positions: positions ?? {},
          peaksCache: peaksCache ?? {},
          durations: durations ?? {},
          pwaInstalled: pwaInstalled ?? false,
          pwaInstallDismissed: pwaInstallDismissed ?? false,
          offlineSets: offlineSets ?? {},
          hasRequestedPersist: hasRequestedPersist ?? false,
        };
      },
    },
  ),
);

// Returns `true` once Zustand's persist middleware has finished rehydrating
// from localStorage, `false` before that. Use for components that gate
// rendering on persisted state (e.g. <InstallCta> checking pwaInstallDismissed)
// so they don't flash the wrong UI for one frame between mount and the
// `HydrateStore` effect firing `persist.rehydrate()`.
//
// Implemented via `useSyncExternalStore` so the React 19 compiler treats it
// as a proper external subscription — no stale-closure pitfalls, SSR-safe
// (returns false on the server), and re-renders any consumer the moment
// `onFinishHydration` fires.
export function useStoreHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useStore.persist.onFinishHydration(cb),
    () => useStore.persist.hasHydrated(),
    () => false,
  );
}
