import { afterEach, describe, expect, it, vi } from "vitest";
import { readAudioDuration, validateArtworkFile, validatePeaksFile } from "~/utils/validateUpload";

// Shape verified against a REAL
// peaks file pulled from R2 (t.i.l.'s set) — `{ peaks: number[] }`, exactly
// 1000 elements (scripts/generate-peaks.mjs's fixed `PEAKS = 1000`), values
// NOT bounded to [0, 1] (real observed max: 1.137). These tests lock that
// real shape, not the originally-assumed `Array.isArray` guess.

function makeJsonFile(content: unknown, name = "peaks.json"): File {
  return new File([JSON.stringify(content)], name, { type: "application/json" });
}

const validPeaksArray = Array.from({ length: 1000 }, () => 0.5);

describe("validatePeaksFile", () => {
  it("accepts the real shape: { peaks: [1000 numbers] }", async () => {
    expect(await validatePeaksFile(makeJsonFile({ peaks: validPeaksArray }))).toBe(true);
  });

  it("accepts values above 1 (real files aren't bounded to [0,1])", async () => {
    const peaks = [...validPeaksArray];
    peaks[0] = 1.137;
    expect(await validatePeaksFile(makeJsonFile({ peaks }))).toBe(true);
  });

  it("rejects a value above the generous [0,2] headroom", async () => {
    const peaks = [...validPeaksArray];
    peaks[0] = 5;
    expect(await validatePeaksFile(makeJsonFile({ peaks }))).toBe(false);
  });

  it("rejects a negative value", async () => {
    const peaks = [...validPeaksArray];
    peaks[0] = -0.1;
    expect(await validatePeaksFile(makeJsonFile({ peaks }))).toBe(false);
  });

  it("rejects a length other than exactly 1000", async () => {
    expect(await validatePeaksFile(makeJsonFile({ peaks: validPeaksArray.slice(0, 999) }))).toBe(
      false,
    );
    expect(await validatePeaksFile(makeJsonFile({ peaks: [...validPeaksArray, 0.5] }))).toBe(false);
  });

  it("rejects missing the peaks key entirely", async () => {
    expect(await validatePeaksFile(makeJsonFile({ notPeaks: validPeaksArray }))).toBe(false);
  });

  it("rejects a non-array peaks value", async () => {
    expect(await validatePeaksFile(makeJsonFile({ peaks: "not an array" }))).toBe(false);
  });

  it("rejects a NaN/non-finite element", async () => {
    const peaks = [...validPeaksArray];
    peaks[500] = Number.NaN;
    expect(await validatePeaksFile(makeJsonFile({ peaks }))).toBe(false);
  });

  it("rejects invalid JSON", async () => {
    const file = new File(["not json{"], "peaks.json", { type: "application/json" });
    expect(await validatePeaksFile(file)).toBe(false);
  });

  it("rejects a bare array (no top-level object)", async () => {
    const file = new File([JSON.stringify(validPeaksArray)], "peaks.json");
    expect(await validatePeaksFile(file)).toBe(false);
  });
});

describe("validateArtworkFile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a file that decodes successfully", async () => {
    const bitmap = { close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    const file = new File(["fake image bytes"], "artwork.jpg", { type: "image/jpeg" });

    expect(await validateArtworkFile(file)).toBe(true);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it("rejects a file that fails to decode (e.g. a renamed non-image file)", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("not a valid image")));
    const file = new File(["not actually an image"], "fake.jpg", { type: "image/jpeg" });

    expect(await validateArtworkFile(file)).toBe(false);
  });
});

describe("readAudioDuration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // jsdom doesn't decode real audio (no `canvas`/native media pipeline), so
  // `Audio()`'s `loadedmetadata`/`error` never fire naturally here — this
  // captures the instance `readAudioDuration` creates internally and fires
  // the events by hand, exercising the real resolve/reject wiring rather
  // than a re-implementation of it.
  function captureNextAudio(): { get: () => HTMLAudioElement } {
    let captured: HTMLAudioElement | undefined;
    const RealAudio = globalThis.Audio;
    vi.stubGlobal(
      "Audio",
      class extends RealAudio {
        constructor(...args: ConstructorParameters<typeof RealAudio>) {
          super(...args);
          captured = this;
        }
      },
    );
    return {
      get: () => {
        if (!captured) throw new Error("Audio() was never constructed");
        return captured;
      },
    };
  }

  it("resolves with the real duration on loadedmetadata", async () => {
    const capture = captureNextAudio();
    const file = new File(["fake mp3 bytes"], "set.mp3", { type: "audio/mpeg" });

    const promise = readAudioDuration(file);
    const audio = capture.get();
    Object.defineProperty(audio, "duration", { value: 2718, configurable: true });
    audio.dispatchEvent(new Event("loadedmetadata"));

    expect(await promise).toBe(2718);
  });

  it("rejects on an error event (an unplayable / invalid audio file)", async () => {
    const capture = captureNextAudio();
    const file = new File(["not audio"], "fake.mp3", { type: "audio/mpeg" });

    const promise = readAudioDuration(file);
    capture.get().dispatchEvent(new Event("error"));

    await expect(promise).rejects.toThrow("INVALID_AUDIO_FILE");
  });

  // jsdom has no SecurityPolicyViolationEvent constructor, so a plain Event
  // stands in — readAudioDuration only reads `violatedDirective` off
  // whatever it's given, and a real browser's CSP block dispatches this
  // event on `document` before the audio element's own `error` event fires,
  // which is exactly the sequence this simulates.
  it("rejects with a distinct reason when a CSP media-src violation precedes the error event", async () => {
    const capture = captureNextAudio();
    const file = new File(["fake mp3 bytes"], "set.mp3", { type: "audio/mpeg" });

    const promise = readAudioDuration(file);
    const violation = new Event("securitypolicyviolation");
    Object.assign(violation, { violatedDirective: "media-src 'self'" });
    document.dispatchEvent(violation);
    capture.get().dispatchEvent(new Event("error"));

    await expect(promise).rejects.toThrow("AUDIO_BLOCKED_BY_CSP");
  });
});
