import { sets } from "@form-at/data/sets";
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioPlayer } from "~/hooks/useAudioPlayer";
import { useStore } from "~/store";
import { registerAudioElement } from "~/store/playerSlice";

// Locks the `is_offline` plumbing (Analytics 1, 2026-07-08): `sendPlay`
// must compute `wasServedFromIdb` from the CURRENT `offlineSets` at the
// moment the beacon fires and include it in the `/api/signal` payload.
// Reuses the harness shape from useAudioPlayerMediaSession.test.tsx.

function setStandalone(value: boolean) {
  Object.defineProperty(window.navigator, "standalone", {
    configurable: true,
    get: () => value,
  });
}

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
});

afterEach(() => {
  registerAudioElement(null);
  setStandalone(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Plays for >=3s (sendPlay's own floor — anything shorter never beacons)
// then pauses, returning the parsed JSON body of the resulting beacon call.
async function playThenPauseAndCapture(track: (typeof sets)[number]) {
  const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
  const { result } = renderHook(() => {
    const ref = useRef<HTMLAudioElement | null>(audio);
    return useAudioPlayer(ref);
  });
  act(() => useStore.setState({ nowPlaying: track }));

  act(() => result.current.audioProps.onPlay());
  await act(async () => {
    vi.advanceTimersByTime(3500);
  });
  act(() => result.current.audioProps.onPause());

  expect(beaconSpy).toHaveBeenCalledWith("/api/signal", expect.anything());
  const [, blob] = beaconSpy.mock.calls[0] as [string, Blob];
  return JSON.parse(await blob.text());
}

describe("useAudioPlayer sendPlay — is_offline plumbing", () => {
  it("isOffline is true when standalone AND the set is saved (served from IDB)", async () => {
    const track = sets[0];
    if (!track) throw new Error("catalogue empty");
    setStandalone(true);
    useStore.setState({ offlineSets: { [track.id]: { status: "saved" } } });

    const body = await playThenPauseAndCapture(track);
    expect(body).toMatchObject({ setId: track.id, isOffline: true });
  });

  it("isOffline is false in a browser tab even if persisted state says saved", async () => {
    const track = sets[0];
    if (!track) throw new Error("catalogue empty");
    setStandalone(false);
    useStore.setState({ offlineSets: { [track.id]: { status: "saved" } } });

    const body = await playThenPauseAndCapture(track);
    expect(body).toMatchObject({ isOffline: false });
  });

  it("isOffline is false for a not-saved set even in standalone", async () => {
    const track = sets[0];
    if (!track) throw new Error("catalogue empty");
    setStandalone(true);
    useStore.setState({ offlineSets: {} });

    const body = await playThenPauseAndCapture(track);
    expect(body).toMatchObject({ isOffline: false });
  });
});
