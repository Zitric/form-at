import { sets } from "@form-at/data/sets";
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioPlayer } from "~/hooks/useAudioPlayer";
import { useStore } from "~/store";
import { registerAudioElement } from "~/store/playerSlice";
import { setDevMode } from "~/utils/devMode";

// Locks that dev mode SKIPS tracking entirely — not sendBeacon-skipped-but-
// queued (that would just delay the leak into the count, via the offline
// replay path), nothing recorded anywhere.

const queueSignalForReplay = vi.fn();
vi.mock("~/data/beacon-queue", () => ({
  queueSignalForReplay: (...args: unknown[]) => queueSignalForReplay(...args),
}));

let audio: HTMLAudioElement;

beforeEach(() => {
  audio = new Audio();
  registerAudioElement(audio);
  vi.useFakeTimers();
  useStore.setState({
    nowPlaying: null,
    isPlaying: false,
    hasError: false,
    playbackBlockedReason: null,
    offlineSets: {},
  });
  queueSignalForReplay.mockClear();
  window.localStorage.clear();
});

afterEach(() => {
  registerAudioElement(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("useAudioPlayer sendPlay — dev mode", () => {
  it("dev mode active: no sendBeacon, no queued fallback either — nothing sent, nothing recorded", async () => {
    const track = sets[0];
    if (!track) throw new Error("catalogue empty");
    setDevMode(true);
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { result } = renderHook(() => {
      const ref = useRef<HTMLAudioElement | null>(audio);
      return useAudioPlayer(ref);
    });
    act(() => useStore.setState({ nowPlaying: track }));

    act(() => result.current.audioProps.onPlay());
    await act(async () => vi.advanceTimersByTime(3500));
    act(() => result.current.audioProps.onPause());

    expect(beaconSpy).not.toHaveBeenCalled();
    expect(queueSignalForReplay).not.toHaveBeenCalled();
  });

  it("dev mode inactive (default): tracking is untouched", async () => {
    const track = sets[0];
    if (!track) throw new Error("catalogue empty");
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { result } = renderHook(() => {
      const ref = useRef<HTMLAudioElement | null>(audio);
      return useAudioPlayer(ref);
    });
    act(() => useStore.setState({ nowPlaying: track }));

    act(() => result.current.audioProps.onPlay());
    await act(async () => vi.advanceTimersByTime(3500));
    act(() => result.current.audioProps.onPause());

    expect(beaconSpy).toHaveBeenCalledWith("/api/signal", expect.anything());
  });
});
