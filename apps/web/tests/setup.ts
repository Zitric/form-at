import { installDialogPolyfill } from "@form-at/ui/dom-polyfills";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

// Reset DOM between tests so component trees don't leak across them.
afterEach(() => {
  cleanup();
});

// Node 25 injects its own experimental `localStorage`/`sessionStorage`
// globals which shadow jsdom's — without a `--localstorage-file` they're
// stubs with no working methods (that's the "--localstorage-file was
// provided without a valid path" warning at suite startup). zustand's
// persist middleware binds the broken global at store creation, so any
// `useStore.setState` in a test throws `storage.setItem is not a function`
// — and `persist.rehydrate()` can never be exercised. Replace them with a
// real in-memory Storage before any test module imports the store.
function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}
for (const name of ["localStorage", "sessionStorage"] as const) {
  if (typeof window[name]?.setItem !== "function") {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: createMemoryStorage(),
    });
  }
}

installDialogPolyfill();

// jsdom doesn't implement `navigator.sendBeacon`. `useAudioPlayer`'s
// play-tracking (`sendPlay`) and the event-tracking hook (`useTrackEvent`)
// both call it directly, fire-and-forget — without a stub, any test that
// reaches either code path throws "navigator.sendBeacon is not a function".
// Real `sendBeacon` returns a boolean (queued successfully); the stub
// matches that signature. `configurable: true` so individual tests can
// still `vi.spyOn(navigator, "sendBeacon")` to assert on calls.
if (typeof navigator.sendBeacon !== "function") {
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    writable: true,
    value: () => true,
  });
}

// jsdom doesn't implement `window.matchMedia`. `isStandalone()` calls it on
// every playback URL build via `withAppContext`. Stub a non-matching result
// so tests register as "browser tab" and URLs stay bare — which matches
// what existing assertions expect (audio.src === bare R2 URL).
if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom returns undefined from HTMLMediaElement.prototype.play() — replace it
// with a Promise-returning stub plus a pause()/load() that mirror what
// useAudioPlayer / playerSlice expect from a real audio element.
beforeEach(() => {
  const proto = window.HTMLMediaElement.prototype;
  Object.defineProperty(proto, "play", {
    configurable: true,
    writable: true,
    value: function play() {
      Object.defineProperty(this, "paused", { configurable: true, value: false });
      return Promise.resolve();
    },
  });
  Object.defineProperty(proto, "pause", {
    configurable: true,
    writable: true,
    value: function pause() {
      Object.defineProperty(this, "paused", { configurable: true, value: true });
    },
  });
  Object.defineProperty(proto, "load", {
    configurable: true,
    writable: true,
    value: () => {},
  });

  // Reset persisted Zustand state between tests where storage exists.
  try {
    window.localStorage?.clear();
  } catch {}
  try {
    window.sessionStorage?.clear();
  } catch {}
});
