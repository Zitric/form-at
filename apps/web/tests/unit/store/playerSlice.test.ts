import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import type { MusicSet } from "~/data/sets";
import { createPlayerSlice, registerAudioElement } from "~/store/playerSlice";

// Toggles navigator.onLine for a single test. jsdom exposes onLine as a
// getter on the Navigator prototype; defineProperty overrides it locally
// without leaking into the next test's beforeEach reset.
function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

const trackA: MusicSet = {
  id: "set-a",
  title: "FORM:AT TEST",
  artist: "test-a",
  date: "2026-01-01",
  src: "https://example.test/a.mp3",
};

const trackB: MusicSet = {
  id: "set-b",
  title: "FORM:AT TEST",
  artist: "test-b",
  date: "2026-01-02",
  src: "https://example.test/b.mp3",
};

function makeStore() {
  return create(createPlayerSlice);
}

let audio: HTMLAudioElement;

beforeEach(() => {
  audio = new Audio();
  registerAudioElement(audio);
});

afterEach(() => {
  registerAudioElement(null);
  // Restore online so gate tests don't leak into unrelated ones.
  setNavigatorOnline(true);
});

describe("loadTrack", () => {
  it("sets nowPlaying without auto-playing", () => {
    const store = makeStore();
    store.getState().loadTrack(trackA);
    const s = store.getState();
    expect(s.nowPlaying).toEqual(trackA);
    expect(s.isPlaying).toBe(false);
    expect(s.hasError).toBe(false);
  });
});

describe("playTrack", () => {
  it("sets nowPlaying and triggers play() synchronously", async () => {
    const store = makeStore();
    store.getState().playTrack(trackA);

    expect(store.getState().nowPlaying).toEqual(trackA);
    expect(audio.src).toContain("a.mp3");
    // Identity stamp — useAudioPlayer's main effect keys on this to
    // skip re-loading a track the click path already attached. Without
    // it, the effect races playerSlice and can spawn a request loop
    // (see the chunk-5 marker-URL comparison bug this replaced).
    expect(audio.dataset.trackId).toBe(trackA.id);
  });

  it("toggles play/pause when clicking the same track twice", async () => {
    const store = makeStore();
    store.getState().playTrack(trackA);
    await Promise.resolve();
    expect(store.getState().isPlaying).toBe(true);

    store.getState().playTrack(trackA);
    expect(audio.paused).toBe(true);
    expect(store.getState().isPlaying).toBe(false);
  });

  it("switches src when playing a different track", async () => {
    const store = makeStore();
    store.getState().playTrack(trackA);
    await Promise.resolve();
    store.getState().playTrack(trackB);

    expect(store.getState().nowPlaying).toEqual(trackB);
    expect(audio.src).toContain("b.mp3");
    // Identity stamp follows the src across a cross-track switch — the
    // whole point of the stamp is that useAudioPlayer never confuses A
    // with B (which the previous URL-string comparison did under the
    // `?ctx=app` marker).
    expect(audio.dataset.trackId).toBe(trackB.id);
  });

  it("clears hasError on successful play", async () => {
    const store = makeStore();
    store.getState().setHasError(true);
    store.getState().playTrack(trackA);
    await Promise.resolve();
    expect(store.getState().hasError).toBe(false);
  });
});

// Retry-storm gate (TECH_DEBT 11): offline + non-saved must refuse to
// attach/reload `<audio>`'s source or Chrome retries the failing Range
// requests dozens of times. Chunk-3c added the gate to the new-track
// branch; the same-track branch had none, so re-tapping a currently-
// loaded non-saved set offline still spawned the storm. The unified
// gate below both branches closes the gap by construction — these two
// cases lock the invariant so a future refactor can't drop one branch
// again.
describe("playTrack offline gate", () => {
  it("blocks same-track resume when non-saved (no audio.play, reason set)", async () => {
    const store = makeStore();
    // Simulate the reproducer: played the set online, paused, went offline.
    store.getState().playTrack(trackA);
    await Promise.resolve();
    audio.pause();
    expect(audio.paused).toBe(true);

    setNavigatorOnline(false);
    const playSpy = vi.spyOn(audio, "play");

    store.getState().playTrack(trackA);

    expect(playSpy).not.toHaveBeenCalled();
    expect(audio.paused).toBe(true);
    expect(store.getState().playbackBlockedReason).not.toBeNull();
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().hasError).toBe(true);
  });

  it("allows same-track resume when saved (plays from IDB)", async () => {
    const store = makeStore();
    store.getState().playTrack(trackA);
    await Promise.resolve();
    audio.pause();

    setNavigatorOnline(false);
    // Mark trackA as saved so the gate is bypassed (offlineStatus === "saved").
    // playerSlice reads `state.offlineSets?.[id]?.status` via optional
    // chaining — safe to set here even though this test store doesn't
    // compose OfflineSlice.
    store.setState({
      offlineSets: {
        [trackA.id]: { status: "saved", bytesTotal: 1000, savedAt: 0 },
      },
    } as unknown as Parameters<typeof store.setState>[0]);
    const playSpy = vi.spyOn(audio, "play");

    store.getState().playTrack(trackA);

    expect(playSpy).toHaveBeenCalled();
    expect(store.getState().playbackBlockedReason).toBeNull();
  });

  it("still allows pausing a currently-playing non-saved track offline (audio.pause never fetches)", async () => {
    const store = makeStore();
    store.getState().playTrack(trackA);
    await Promise.resolve();
    expect(audio.paused).toBe(false);

    setNavigatorOnline(false);

    // Same-track tap while playing → should PAUSE (not fetch), even
    // though we're offline and the track isn't saved. Otherwise the
    // user is trapped on a stalled stream.
    store.getState().playTrack(trackA);

    expect(audio.paused).toBe(true);
    expect(store.getState().isPlaying).toBe(false);
    // Not gated — this is a legitimate pause, not a blocked start.
    expect(store.getState().playbackBlockedReason).toBeNull();
  });
});

describe("togglePlay", () => {
  it("plays when paused", async () => {
    const store = makeStore();
    store.getState().playTrack(trackA);
    await Promise.resolve();
    audio.pause();
    store.getState().togglePlay();
    await Promise.resolve();
    expect(store.getState().isPlaying).toBe(true);
  });

  it("pauses when playing", async () => {
    const store = makeStore();
    store.getState().playTrack(trackA);
    await Promise.resolve();
    store.getState().togglePlay();
    expect(store.getState().isPlaying).toBe(false);
    expect(audio.paused).toBe(true);
  });

  it("is a no-op when no audio element registered", () => {
    registerAudioElement(null);
    const store = makeStore();
    expect(() => store.getState().togglePlay()).not.toThrow();
  });
});

describe("position cache", () => {
  it("setLastPosition records a per-set position", () => {
    const store = makeStore();
    store.getState().setLastPosition("set-a", 120);
    store.getState().setLastPosition("set-b", 240);
    expect(store.getState().positions).toEqual({ "set-a": 120, "set-b": 240 });
  });
});

describe("hasError flag", () => {
  it("can be toggled with setHasError", () => {
    const store = makeStore();
    expect(store.getState().hasError).toBe(false);
    store.getState().setHasError(true);
    expect(store.getState().hasError).toBe(true);
    store.getState().setHasError(false);
    expect(store.getState().hasError).toBe(false);
  });
});
