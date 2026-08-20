import { sets } from "@form-at/data/sets";
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioPlayer } from "~/hooks/useAudioPlayer";
import { useStore } from "~/store";
import { registerAudioElement } from "~/store/playerSlice";

// Locks the session-id fix for the "plays" metric actually counting
// listening SEGMENTS (one row per pause/track-change/unload beacon), not
// plays — see schema.sql's `session_id` comment. Every segment beacon
// within one continuous engagement with a track must carry the SAME
// sessionId so read-time COUNT(DISTINCT session_id) collapses them back
// into one play; a genuinely new engagement (track change, or returning to
// a track played earlier) must get a NEW one.

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
    positions: {},
  });
});

afterEach(() => {
  registerAudioElement(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function capturedBeacons(beaconSpy: ReturnType<typeof vi.spyOn>) {
  return Promise.all(
    beaconSpy.mock.calls.map(async ([, blob]) => JSON.parse(await (blob as Blob).text())),
  );
}

describe("useAudioPlayer sendPlay — session id", () => {
  it("pause/resume/pause reuses the SAME session id across both segment beacons — the exact bug this fixes", async () => {
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

    act(() => result.current.audioProps.onPlay());
    await act(async () => vi.advanceTimersByTime(3500));
    act(() => result.current.audioProps.onPause());

    const bodies = await capturedBeacons(beaconSpy);
    expect(bodies).toHaveLength(2);
    expect(bodies[0].sessionId).toEqual(expect.any(String));
    expect(bodies[1].sessionId).toBe(bodies[0].sessionId);
  });

  it("the beforeunload beacon carries the session id set at track load, not null", async () => {
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

    // No onPause — the only beacon for this engagement comes from the
    // beforeunload handler, which reads the SAME sessionIdRef set when the
    // track loaded (it's a ref, not React state torn down between renders).
    act(() => window.dispatchEvent(new Event("beforeunload")));

    const bodies = await capturedBeacons(beaconSpy);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].sessionId).toEqual(expect.any(String));
  });

  it("track change and back (A → B → A) gives the two A engagements DIFFERENT session ids", async () => {
    const trackA = sets[0];
    const trackB = sets[1];
    if (!trackA || !trackB) throw new Error("catalogue needs at least two sets");
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
    const { result } = renderHook(() => {
      const ref = useRef<HTMLAudioElement | null>(audio);
      return useAudioPlayer(ref);
    });

    // First engagement with A.
    act(() => useStore.setState({ nowPlaying: trackA }));
    act(() => result.current.audioProps.onPlay());
    await act(async () => vi.advanceTimersByTime(3500));

    // Switch to B — the track-load effect's cleanup flushes A's open
    // segment (beacon #1) before B's session id is generated.
    await act(async () => useStore.setState({ nowPlaying: trackB }));

    // Back to A — a genuinely new engagement, not a resume of the first.
    await act(async () => useStore.setState({ nowPlaying: trackA }));
    act(() => result.current.audioProps.onPlay());
    await act(async () => vi.advanceTimersByTime(3500));
    act(() => result.current.audioProps.onPause());

    const bodies = (await capturedBeacons(beaconSpy)).filter((b) => b.setId === trackA.id);
    expect(bodies).toHaveLength(2);
    expect(bodies[0].sessionId).toEqual(expect.any(String));
    expect(bodies[1].sessionId).toEqual(expect.any(String));
    expect(bodies[1].sessionId).not.toBe(bodies[0].sessionId);
  });

  it("two independent hook instances (two tabs) playing the same track get different session ids", async () => {
    const track = sets[0];
    if (!track) throw new Error("catalogue empty");
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);

    const audioTabTwo = new Audio();
    const hookOne = renderHook(() => {
      const ref = useRef<HTMLAudioElement | null>(audio);
      return useAudioPlayer(ref);
    });
    act(() => useStore.setState({ nowPlaying: track }));
    act(() => hookOne.result.current.audioProps.onPlay());
    await act(async () => vi.advanceTimersByTime(3500));
    act(() => hookOne.result.current.audioProps.onPause());

    // A second, fully independent hook instance simulates a second tab —
    // its own module-scope-free ref state, not sharing sessionIdRef with
    // the first.
    registerAudioElement(audioTabTwo);
    const hookTwo = renderHook(() => {
      const ref = useRef<HTMLAudioElement | null>(audioTabTwo);
      return useAudioPlayer(ref);
    });
    act(() => useStore.setState({ nowPlaying: null }));
    act(() => useStore.setState({ nowPlaying: track }));
    act(() => hookTwo.result.current.audioProps.onPlay());
    await act(async () => vi.advanceTimersByTime(3500));
    act(() => hookTwo.result.current.audioProps.onPause());

    const bodies = await capturedBeacons(beaconSpy);
    expect(bodies).toHaveLength(2);
    expect(bodies[0].sessionId).not.toBe(bodies[1].sessionId);
  });
});
