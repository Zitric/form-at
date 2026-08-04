import { sets } from "@form-at/data/sets";
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioPlayer } from "~/hooks/useAudioPlayer";
import { useStore } from "~/store";
import { registerAudioElement } from "~/store/playerSlice";

// M1 flagship path: lock-screen resume while offline on an unsaved set —
// the Media Session "play" handler must route through the gated
// resumePlayback AND pin mediaSession.playbackState to "paused" so the
// lock-screen UI can't show a lying "playing" state. The other rewired
// hook paths (Space, player-bar togglePlay, isPlaying bridge, non-restore
// load) are the same one-line delegation into the store action, which
// playerSlice.test.ts locks directly.

type CapturedHandlers = Record<string, (() => void) | null>;

const handlers: CapturedHandlers = {};
const mediaSessionMock = {
  metadata: null as unknown,
  playbackState: "none" as MediaSessionPlaybackState,
  setActionHandler: (name: string, fn: (() => void) | null) => {
    handlers[name] = fn;
  },
};

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

let audio: HTMLAudioElement;

beforeEach(() => {
  audio = new Audio();
  registerAudioElement(audio);
  Object.defineProperty(navigator, "mediaSession", {
    configurable: true,
    value: mediaSessionMock,
  });
  vi.stubGlobal(
    "MediaMetadata",
    class {
      constructor(init: unknown) {
        Object.assign(this, init);
      }
    },
  );
  useStore.setState({
    nowPlaying: null,
    isPlaying: false,
    hasError: false,
    playbackBlockedReason: null,
  });
});

afterEach(() => {
  registerAudioElement(null);
  setNavigatorOnline(true);
  vi.unstubAllGlobals();
  // biome-ignore lint/performance/noDelete: restoring the absent jsdom default
  delete (navigator as { mediaSession?: unknown }).mediaSession;
  mediaSessionMock.playbackState = "none";
});

describe("Media Session play handler (lock-screen resume)", () => {
  it("blocked offline: reason set, element untouched, playbackState pinned to paused", () => {
    const track = sets[0];
    if (!track) throw new Error("catalogue empty");

    renderHook(() => {
      const ref = useRef<HTMLAudioElement | null>(audio);
      return useAudioPlayer(ref);
    });
    // Triggers the media-session effect (deps: nowPlaying) on re-render.
    act(() => useStore.setState({ nowPlaying: track }));

    const playHandler = handlers.play;
    expect(playHandler).toBeTypeOf("function");

    setNavigatorOnline(false);
    audio.pause();
    const playSpy = vi.spyOn(audio, "play");

    playHandler?.();

    expect(playSpy).not.toHaveBeenCalled();
    expect(useStore.getState().playbackBlockedReason).toBe("tab-offline-needs-network");
    expect(useStore.getState().isPlaying).toBe(false);
    expect(mediaSessionMock.playbackState).toBe("paused");
  });

  it("online: resumes and leaves playbackState alone", async () => {
    const track = sets[0];
    if (!track) throw new Error("catalogue empty");

    renderHook(() => {
      const ref = useRef<HTMLAudioElement | null>(audio);
      return useAudioPlayer(ref);
    });
    act(() => useStore.setState({ nowPlaying: track }));

    audio.pause();
    handlers.play?.();
    await Promise.resolve();

    expect(useStore.getState().isPlaying).toBe(true);
    expect(mediaSessionMock.playbackState).toBe("none");
  });
});
