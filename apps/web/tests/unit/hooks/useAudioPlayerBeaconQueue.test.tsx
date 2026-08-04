import { sets } from "@form-at/data/sets";
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioPlayer } from "~/hooks/useAudioPlayer";
import { useStore } from "~/store";
import { registerAudioElement } from "~/store/playerSlice";

// Locks TECH_DEBT 4 (beacon queue): a play beacon that fails to send must be
// queued instead of dropped, WITHOUT touching the online happy path. Reuses
// the harness shape from useAudioPlayerIsOffline.test.tsx.

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
});

afterEach(() => {
  registerAudioElement(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
}

// Plays for >=3s (sendPlay's own floor) then pauses — same shape as the
// is_offline suite's helper.
async function playThenPause(track: (typeof sets)[number]) {
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
}

describe("useAudioPlayer sendPlay — beacon queue on failure", () => {
  it("online + sendBeacon succeeds: happy path untouched, queue never called", async () => {
    const track = sets[0];
    if (!track) throw new Error("catalogue empty");
    setOnline(true);
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);

    await playThenPause(track);

    expect(beaconSpy).toHaveBeenCalledWith("/api/signal", expect.anything());
    expect(queueSignalForReplay).not.toHaveBeenCalled();
  });

  it("known-offline: sendBeacon is skipped entirely, the payload is queued instead", async () => {
    const track = sets[0];
    if (!track) throw new Error("catalogue empty");
    setOnline(false);
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);

    await playThenPause(track);

    expect(beaconSpy).not.toHaveBeenCalled();
    expect(queueSignalForReplay).toHaveBeenCalledWith(
      expect.objectContaining({ setId: track.id, listenedSeconds: 3 }),
    );
  });

  it("online but sendBeacon rejects the send (returns false): queued as a fallback", async () => {
    const track = sets[0];
    if (!track) throw new Error("catalogue empty");
    setOnline(true);
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(false);

    await playThenPause(track);

    expect(beaconSpy).toHaveBeenCalled();
    expect(queueSignalForReplay).toHaveBeenCalledWith(expect.objectContaining({ setId: track.id }));
  });
});
