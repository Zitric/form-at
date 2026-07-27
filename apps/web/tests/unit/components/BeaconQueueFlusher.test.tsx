import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BeaconQueueFlusher } from "~/components/BeaconQueueFlusher";

// Locks TECH_DEBT 4's fallback replay path — for browsers with no
// Background Sync at all (Safari, Firefox). Replays on mount (if online)
// and on the `online` event; only dequeues entries that actually send.

const getQueuedSignals = vi.fn();
const dequeueSignal = vi.fn();
vi.mock("~/data/beacon-queue", () => ({
  getQueuedSignals: () => getQueuedSignals(),
  dequeueSignal: (id: number) => dequeueSignal(id),
}));

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
}

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  getQueuedSignals.mockReset();
  dequeueSignal.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  setOnline(true);
});

describe("BeaconQueueFlusher — mount replay", () => {
  it("replays every queued signal on mount when online, dequeuing each on success", async () => {
    setOnline(true);
    getQueuedSignals.mockResolvedValue([
      { id: 1, payload: { setId: "a" } },
      { id: 2, payload: { setId: "b" } },
    ]);
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);

    render(<BeaconQueueFlusher />);
    await flushMicrotasks();

    expect(beaconSpy).toHaveBeenCalledTimes(2);
    expect(dequeueSignal).toHaveBeenCalledWith(1);
    expect(dequeueSignal).toHaveBeenCalledWith(2);
  });

  it("does NOT attempt replay on mount while offline", async () => {
    setOnline(false);
    getQueuedSignals.mockResolvedValue([{ id: 1, payload: { setId: "a" } }]);

    render(<BeaconQueueFlusher />);
    await flushMicrotasks();

    expect(getQueuedSignals).not.toHaveBeenCalled();
  });

  it("leaves a still-failing entry queued — only dequeues on an actual successful send", async () => {
    setOnline(true);
    getQueuedSignals.mockResolvedValue([{ id: 1, payload: { setId: "a" } }]);
    vi.spyOn(navigator, "sendBeacon").mockReturnValue(false);

    render(<BeaconQueueFlusher />);
    await flushMicrotasks();

    expect(dequeueSignal).not.toHaveBeenCalled();
  });
});

describe("BeaconQueueFlusher — online event", () => {
  it("replays the queue again when connectivity returns while the app stays open", async () => {
    setOnline(false);
    getQueuedSignals.mockResolvedValue([{ id: 1, payload: { setId: "a" } }]);
    const beaconSpy = vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);

    render(<BeaconQueueFlusher />);
    await flushMicrotasks();
    expect(beaconSpy).not.toHaveBeenCalled(); // offline at mount — no attempt yet

    setOnline(true);
    window.dispatchEvent(new Event("online"));
    await flushMicrotasks();

    expect(beaconSpy).toHaveBeenCalledTimes(1);
    expect(dequeueSignal).toHaveBeenCalledWith(1);
  });
});
