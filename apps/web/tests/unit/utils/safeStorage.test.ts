import { afterEach, describe, expect, it, vi } from "vitest";
import { safeLocal, safeSession } from "~/utils/safeStorage";

// jsdom's window.localStorage in this vitest worker setup is broken — it
// exposes an empty object without setItem (same gotcha ShareModal.test.tsx
// documents and works around). Tests that exercise the round-trip therefore
// stub window with a Map-backed Storage shape, and tests that exercise the
// error / SSR branches stub it with throwing or undefined globals.

function makeMapStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
    clear: () => {
      data.clear();
    },
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
  removeItem: () => {
    throw new Error("denied");
  },
} as unknown as Storage;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("safeLocal / safeSession", () => {
  it("round-trips a value through localStorage", () => {
    vi.stubGlobal("window", { localStorage: makeMapStorage(), sessionStorage: makeMapStorage() });
    safeLocal.set("k", "hello");
    expect(safeLocal.get("k")).toBe("hello");
  });

  it("round-trips a value through sessionStorage", () => {
    vi.stubGlobal("window", { localStorage: makeMapStorage(), sessionStorage: makeMapStorage() });
    safeSession.set("k", "hello");
    expect(safeSession.get("k")).toBe("hello");
  });

  it("get returns null for a missing key", () => {
    vi.stubGlobal("window", { localStorage: makeMapStorage(), sessionStorage: makeMapStorage() });
    expect(safeLocal.get("never-set")).toBeNull();
    expect(safeSession.get("never-set")).toBeNull();
  });

  it("remove() makes a previously-set key read as null", () => {
    vi.stubGlobal("window", { localStorage: makeMapStorage(), sessionStorage: makeMapStorage() });
    safeLocal.set("k", "x");
    safeLocal.remove("k");
    expect(safeLocal.get("k")).toBeNull();
  });

  it("get returns null silently when underlying storage throws", () => {
    vi.stubGlobal("window", { localStorage: throwingStorage, sessionStorage: throwingStorage });
    expect(safeLocal.get("k")).toBeNull();
    expect(safeSession.get("k")).toBeNull();
  });

  it("set is a silent no-op when underlying storage throws", () => {
    vi.stubGlobal("window", { localStorage: throwingStorage, sessionStorage: throwingStorage });
    expect(() => safeLocal.set("k", "v")).not.toThrow();
    expect(() => safeSession.set("k", "v")).not.toThrow();
  });

  it("remove is a silent no-op when underlying storage throws", () => {
    vi.stubGlobal("window", { localStorage: throwingStorage, sessionStorage: throwingStorage });
    expect(() => safeLocal.remove("k")).not.toThrow();
    expect(() => safeSession.remove("k")).not.toThrow();
  });

  it("get returns null when window is undefined (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(safeLocal.get("k")).toBeNull();
    expect(safeSession.get("k")).toBeNull();
  });

  it("set / remove are no-ops (no throw) when window is undefined (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => safeLocal.set("k", "v")).not.toThrow();
    expect(() => safeSession.set("k", "v")).not.toThrow();
    expect(() => safeLocal.remove("k")).not.toThrow();
    expect(() => safeSession.remove("k")).not.toThrow();
  });
});
