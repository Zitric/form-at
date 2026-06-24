// Thin try/catch + SSR-safe wrapper around browser storage. Use for keys we
// own DIRECTLY — keys owned by Zustand's persist middleware (player state,
// pwaInstalled, pwaInstallDismissed, etc.) stay there, do NOT route through
// here. The wrapper exists for two narrow cases:
//   - sessionStorage one-off flags (e.g. the iOS in-app browser banner's
//     dismiss flag, which is intentionally session-scoped)
//   - localStorage migration reads of legacy keys written before a piece of
//     state was moved into Zustand
//
// Both storages can throw in private-mode Safari and in partitioned/blocked
// third-party iframe contexts. Crashing the mount or a click handler in those
// cases is worse UX than silently skipping the persistence — the user still
// gets in-session behaviour, they just won't have it remembered next time.

type SafeStorage = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
};

function makeSafeStorage(getStorage: () => Storage | null): SafeStorage {
  return {
    get(key) {
      try {
        return getStorage()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        getStorage()?.setItem(key, value);
      } catch {
        // silent — see file header
      }
    },
    remove(key) {
      try {
        getStorage()?.removeItem(key);
      } catch {
        // silent — see file header
      }
    },
  };
}

export const safeLocal = makeSafeStorage(() =>
  typeof window === "undefined" ? null : window.localStorage,
);

export const safeSession = makeSafeStorage(() =>
  typeof window === "undefined" ? null : window.sessionStorage,
);
