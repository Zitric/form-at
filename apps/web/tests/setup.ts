import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

// Reset DOM between tests so component trees don't leak across them.
afterEach(() => {
  cleanup();
});

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
