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

// jsdom doesn't implement HTMLDialogElement.showModal()/close() — polyfill
// just enough for Modal to mount/unmount as it would in a real browser.
// Real browsers also focus the first focusable child on showModal(), which is
// what lets keydown events bubble up to onKeyDown on the dialog. Without that
// focus shift, keydown would fire on body instead and never reach the dialog.
const dialogProto = window.HTMLDialogElement?.prototype;
if (dialogProto && typeof dialogProto.showModal !== "function") {
  dialogProto.showModal = function () {
    this.setAttribute("open", "");
    const focusable = this.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    focusable?.focus();
  };
  dialogProto.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
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
