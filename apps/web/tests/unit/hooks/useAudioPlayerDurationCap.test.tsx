import { sets } from "@form-at/data/sets";
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioPlayer } from "~/hooks/useAudioPlayer";
import { useStore } from "~/store";
import { registerAudioElement } from "~/store/playerSlice";
import { MAX_LISTENED_SECONDS } from "~/utils/playTracking";

// Locks the fix for the timer bug found in production data: a single
// segment reached 7945s (2h12m) on a 96-min set because sendPlay's elapsed
// was pure wall-clock with no relation to the track's own length. A
// segment can never legitimately exceed the track's real duration
// (playerSlice's `durations` cache) when it's known, and never exceed
// MAX_LISTENED_SECONDS when it isn't.

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
    durations: {},
  });
});

afterEach(() => {
  registerAudioElement(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function capturedBody(beaconSpy: ReturnType<typeof vi.spyOn>) {
  const [, blob] = beaconSpy.mock.calls[0] as [string, Blob];
  return JSON.parse(await blob.text());
}

describe("useAudioPlayer sendPlay — duration cap", () => {
  it("caps a segment at the track's known duration when wall-clock elapsed exceeds it (the exact bug: a stall/background gap counted as listening)", async () => {
    const track = sets[0];
    if (!track) throw new Error("catalogue empty");
    useStore.setState({ durations: { [track.id]: 90 } }); // a 90s track
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { result } = renderHook(() => {
      const ref = useRef<HTMLAudioElement | null>(audio);
      return useAudioPlayer(ref);
    });
    act(() => useStore.setState({ nowPlaying: track }));

    act(() => result.current.audioProps.onPlay());
    // Wall clock advances far beyond the track's real 90s length — the
    // stall/backgrounded-tab scenario.
    await act(async () => vi.advanceTimersByTime(2 * 60 * 60 * 1000));
    act(() => result.current.audioProps.onPause());

    const body = await capturedBody(beaconSpy);
    expect(body.listenedSeconds).toBe(90);
  });

  it("does not cap a segment that's genuinely shorter than the track's duration", async () => {
    const track = sets[0];
    if (!track) throw new Error("catalogue empty");
    useStore.setState({ durations: { [track.id]: 5400 } }); // a 90-min track
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { result } = renderHook(() => {
      const ref = useRef<HTMLAudioElement | null>(audio);
      return useAudioPlayer(ref);
    });
    act(() => useStore.setState({ nowPlaying: track }));

    act(() => result.current.audioProps.onPlay());
    await act(async () => vi.advanceTimersByTime(30_000));
    act(() => result.current.audioProps.onPause());

    const body = await capturedBody(beaconSpy);
    expect(body.listenedSeconds).toBe(30);
  });

  it("falls back to MAX_LISTENED_SECONDS, not uncapped, when the track's duration isn't cached yet", async () => {
    const track = sets[0];
    if (!track) throw new Error("catalogue empty");
    // durations deliberately left empty — the "duration not known yet" case.
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { result } = renderHook(() => {
      const ref = useRef<HTMLAudioElement | null>(audio);
      return useAudioPlayer(ref);
    });
    act(() => useStore.setState({ nowPlaying: track }));

    act(() => result.current.audioProps.onPlay());
    await act(async () => vi.advanceTimersByTime((MAX_LISTENED_SECONDS + 3600) * 1000));
    act(() => result.current.audioProps.onPause());

    const body = await capturedBody(beaconSpy);
    expect(body.listenedSeconds).toBe(MAX_LISTENED_SECONDS);
  });
});
