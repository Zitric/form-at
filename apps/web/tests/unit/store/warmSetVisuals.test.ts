import type { MusicSet } from "@form-at/data/sets";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { warmSetVisuals } from "~/store/offlineSlice";

// warmSetVisuals warms the artwork-v1 cache for every page describing a
// saved set's world — set artwork + the DJ photo for the set's artist.
// The DJ photo coverage was added on 2026-07-02 to close an offline gap
// where a direct-to-offline first visit to /djs/$djId rendered a broken
// image (SWR miss, nothing warmed on save). These tests lock the two
// warmings so a future refactor can't silently drop one leg.

// Fixture DJ wired to a fixture set — mirrors the real data/djs.ts shape
// (id + setIds relationship) without depending on the shipping catalogue.
vi.mock("~/data/djs", () => ({
  djs: [
    {
      id: "fixture-dj",
      name: "Fixture DJ",
      type: "resident" as const,
      photo: "djs/fixture-dj",
      setIds: ["fixture-set-linked"],
    },
    // A second DJ with no setIds coverage — used to verify the graceful
    // "no DJ resolves" path (dev-only warn, no photo fetch).
    {
      id: "unwired-dj",
      name: "Unwired DJ",
      type: "resident" as const,
      photo: "djs/unwired-dj",
      setIds: undefined,
    },
  ],
}));

const linkedSet: MusicSet = {
  id: "fixture-set-linked",
  title: "Linked Set",
  artist: "fixture",
  date: "2026-01-01",
  src: "https://example.test/linked.mp3",
  artwork: "sets/fixture-artwork",
};

const unlinkedSet: MusicSet = {
  id: "fixture-set-orphan",
  title: "Orphan Set",
  artist: "orphan",
  date: "2026-01-02",
  src: "https://example.test/orphan.mp3",
  artwork: "sets/orphan-artwork",
};

// Every browser test surface we care about (jsdom + real) has fetch. We
// stub with a resolved Response so warmSetVisuals's `.catch(() => {})`
// only fires when we deliberately want it to (which these tests don't).
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => new Response("", { status: 200 }));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// Each Image variant × source pair — reused by the URL-shape assertions.
const VARIANTS = ["640.avif", "1080.avif", "640.webp", "1080.webp"];
const urlsFor = (basePath: string) => VARIANTS.map((v) => `/images/${basePath}-${v}`);

describe("warmSetVisuals", () => {
  it("warms set artwork + DJ photo when the set is wired into a dj.setIds", async () => {
    await warmSetVisuals(linkedSet);

    const fetchMock = vi.mocked(globalThis.fetch);
    const requested = fetchMock.mock.calls.map(([u]) => u);

    // Set artwork: all four variants.
    for (const url of urlsFor("sets/fixture-artwork")) {
      expect(requested).toContain(url);
    }
    // DJ photo: all four variants — the invariant this test exists to lock.
    // If a future refactor drops the DJ leg of the warming, THIS is the
    // assertion that catches it.
    for (const url of urlsFor("djs/fixture-dj")) {
      expect(requested).toContain(url);
    }
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("warms only set artwork + emits a dev warn when no DJ resolves", async () => {
    // vitest defaults NODE_ENV to "test"; the guard in warmSetVisuals
    // checks "development", so stub to development for this assertion.
    // vi.unstubAllEnvs in afterEach restores.
    vi.stubEnv("NODE_ENV", "development");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await warmSetVisuals(unlinkedSet);

    vi.unstubAllEnvs();

    const fetchMock = vi.mocked(globalThis.fetch);
    const requested = fetchMock.mock.calls.map(([u]) => u);

    for (const url of urlsFor("sets/orphan-artwork")) {
      expect(requested).toContain(url);
    }
    // No DJ photo variants warmed — nothing to look up.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // Dev warn fired with a message that names the specific set id so a
    // future data-authoring gap is greppable.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("fixture-set-orphan");
  });

  it("is a no-op when the set has no artwork AND no DJ resolves", async () => {
    const bareSet: MusicSet = {
      id: "fixture-set-bare",
      title: "Bare Set",
      artist: "bare",
      date: "2026-01-03",
      src: "https://example.test/bare.mp3",
      // no artwork field
    };

    await warmSetVisuals(bareSet);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
