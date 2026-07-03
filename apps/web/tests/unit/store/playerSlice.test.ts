import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import type { MusicSet } from "~/data/sets";
import {
  canFetchPlaybackBytes,
  createPlayerSlice,
  registerAudioElement,
} from "~/store/playerSlice";

// Toggles navigator.onLine for a single test. jsdom exposes onLine as a
// getter on the Navigator prototype; defineProperty overrides it locally
// without leaking into the next test's beforeEach reset.
function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

// Toggles the standalone signal `isStandalone()` reads. In jsdom the
// matchMedia stub returns matches:false, so `navigator.standalone` is the
// only signal that can flip the result to true — perfect for driving the
// tab-vs-app branch of the offline gate.
function setStandalone(value: boolean) {
  Object.defineProperty(window.navigator, "standalone", {
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
  // Restore online + non-standalone so gate tests don't leak.
  setNavigatorOnline(true);
  setStandalone(false);
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
  it("blocks same-track resume when non-saved standalone → 'not-saved-offline' reason", async () => {
    const store = makeStore();
    // Simulate the reproducer: played the set online, paused, went offline.
    store.getState().playTrack(trackA);
    await Promise.resolve();
    audio.pause();
    expect(audio.paused).toBe(true);

    setStandalone(true);
    setNavigatorOnline(false);
    const playSpy = vi.spyOn(audio, "play");

    store.getState().playTrack(trackA);

    expect(playSpy).not.toHaveBeenCalled();
    expect(audio.paused).toBe(true);
    // App-context reason: the toast will say "not saved for offline listening".
    expect(store.getState().playbackBlockedReason).toBe("not-saved-offline");
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().hasError).toBe(true);
  });

  it("allows same-track resume when standalone AND saved (plays from IDB)", async () => {
    const store = makeStore();
    store.getState().playTrack(trackA);
    await Promise.resolve();
    audio.pause();

    setStandalone(true);
    setNavigatorOnline(false);
    // The invariant `canReadOfflineBytes = isStandalone && saved` — BOTH
    // legs required to skip the gate. The standalone flag makes the SW
    // audio handler honour the `?ctx=app` marker and serve from IDB;
    // "saved" in offlineSets means the bytes are actually there. Either
    // leg missing (e.g. tab context, or missing persist entry) has to
    // block, or `audio.play()` fires a network request that can't succeed.
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

  it("blocks same-track resume in a TAB even when persisted 'saved' (unified tab-offline message)", async () => {
    const store = makeStore();
    store.getState().playTrack(trackA);
    await Promise.resolve();
    audio.pause();

    // Not calling setStandalone(true) — this test is the tab context.
    setNavigatorOnline(false);
    // Persisted-saved state (from the app on the same origin) is present,
    // but the tab can't read IDB. Old logic skipped the gate here, letting
    // audio.play() fall through to a network fetch that then failed with a
    // misleading "playback_error :: tap to retry". The new gate blocks so
    // the toast points at the app instead.
    store.setState({
      offlineSets: {
        [trackA.id]: { status: "saved", bytesTotal: 1000, savedAt: 0 },
      },
    } as unknown as Parameters<typeof store.setState>[0]);
    const playSpy = vi.spyOn(audio, "play");

    store.getState().playTrack(trackA);

    expect(playSpy).not.toHaveBeenCalled();
    expect(store.getState().playbackBlockedReason).toBe("tab-offline-needs-network");
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

describe("canFetchPlaybackBytes (M1 gate predicate)", () => {
  it("is true whenever online, regardless of saved state", () => {
    setNavigatorOnline(true);
    expect(canFetchPlaybackBytes("set-a", undefined)).toBe(true);
    expect(canFetchPlaybackBytes("set-a", { "set-a": { status: "not-saved" } })).toBe(true);
  });

  it("is false offline when the set isn't saved", () => {
    setNavigatorOnline(false);
    setStandalone(true);
    expect(canFetchPlaybackBytes("set-a", undefined)).toBe(false);
    expect(canFetchPlaybackBytes("set-a", { "set-a": { status: "not-saved" } })).toBe(false);
  });

  it("is false offline in a TAB even when saved (tabs never read IDB)", () => {
    setNavigatorOnline(false);
    setStandalone(false);
    expect(canFetchPlaybackBytes("set-a", { "set-a": { status: "saved" } })).toBe(false);
  });

  it("is true offline only for standalone AND saved", () => {
    setNavigatorOnline(false);
    setStandalone(true);
    expect(canFetchPlaybackBytes("set-a", { "set-a": { status: "saved" } })).toBe(true);
  });
});

// M1 regression block: these are the paths the 2026-07-02 review found
// bypassing the tap-time gate — player bar button, Space, lock-screen
// resume, scrub-release. They all funnel into `resumePlayback` now; these
// tests lock the funnel's behavior at the store level (the hook-side
// delegations are one-line calls into it).
describe("resumePlayback (M1 single gated resume writer)", () => {
  it("blocks resume offline on an unsaved set: reason set, play() never called", async () => {
    const store = makeStore();
    store.getState().playTrack(trackA);
    await Promise.resolve();
    audio.pause();

    setNavigatorOnline(false);
    const playSpy = vi.spyOn(audio, "play");

    store.getState().resumePlayback();

    expect(playSpy).not.toHaveBeenCalled();
    expect(audio.paused).toBe(true);
    expect(store.getState().playbackBlockedReason).toBe("tab-offline-needs-network");
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().hasError).toBe(true);
  });

  it("resumes when online", async () => {
    const store = makeStore();
    store.getState().playTrack(trackA);
    await Promise.resolve();
    audio.pause();

    store.getState().resumePlayback();
    await Promise.resolve();

    expect(store.getState().isPlaying).toBe(true);
    expect(store.getState().playbackBlockedReason).toBeNull();
  });

  it("no-ops without a current track (nothing to resume)", () => {
    const store = makeStore();
    const playSpy = vi.spyOn(audio, "play");
    expect(() => store.getState().resumePlayback()).not.toThrow();
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("scrub-release path: store togglePlay offline+unsaved is blocked through the same funnel", async () => {
    const store = makeStore();
    store.getState().playTrack(trackA);
    await Promise.resolve();
    audio.pause();

    setNavigatorOnline(false);
    const playSpy = vi.spyOn(audio, "play");

    store.getState().togglePlay();

    expect(playSpy).not.toHaveBeenCalled();
    expect(store.getState().playbackBlockedReason).toBe("tab-offline-needs-network");
  });

  it("pause via togglePlay stays ungated offline (audio.pause never fetches)", async () => {
    const store = makeStore();
    store.getState().playTrack(trackA);
    await Promise.resolve();
    expect(audio.paused).toBe(false);

    setNavigatorOnline(false);
    store.getState().togglePlay();

    expect(audio.paused).toBe(true);
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().hasError).toBe(false);
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
