import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";
import type { MusicSet } from "~/data/sets";
import { createPlayerSlice, registerAudioElement } from "~/store/playerSlice";

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

    // play() promise resolves on next tick — wait for it
    await Promise.resolve();
    expect(store.getState().isPlaying).toBe(true);
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
  });

  it("clears hasError on successful play", async () => {
    const store = makeStore();
    store.getState().setHasError(true);
    store.getState().playTrack(trackA);
    await Promise.resolve();
    expect(store.getState().hasError).toBe(false);
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
