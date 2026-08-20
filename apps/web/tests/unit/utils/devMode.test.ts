import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDevModeActive, setDevMode } from "~/utils/devMode";

// Locks the localStorage round-trip devMode.ts is built on — default OFF,
// explicit on/off, no partial states. DevModeBanner.test.tsx covers the
// `?devmode=` activation trigger and the visible-while-active UI.

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("devMode", () => {
  it("defaults to inactive", () => {
    expect(isDevModeActive()).toBe(false);
  });

  it("setDevMode(true) activates it, persisted across reads", () => {
    setDevMode(true);
    expect(isDevModeActive()).toBe(true);
    expect(isDevModeActive()).toBe(true);
  });

  it("setDevMode(false) deactivates it — removes the key rather than writing a falsy value", () => {
    setDevMode(true);
    setDevMode(false);
    expect(isDevModeActive()).toBe(false);
    expect(window.localStorage.getItem("form-at-dev-mode")).toBeNull();
  });
});
