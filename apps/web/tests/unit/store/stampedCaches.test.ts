import { sets } from "@form-at/data/sets";
import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "~/store";
import { cachedPeaksFor, knownDurationFor } from "~/store/playerSlice";

// peaksCache and durations are stamped with the URL they came from, so a
// re-upload (new versioned URLs, TECH_DEBT.md item 31) reads as unknown
// instead of serving the old file's peaks / length forever.

const OLD = "https://cdn.formatglasgow.com/sets/set-x/vmfzx1a2b-4c5d";
const NEW = "https://cdn.formatglasgow.com/sets/set-x/vmg0aaaaa-1a2b";
const setAt = (base: string) => ({
  id: "set-x",
  src: `${base}/audio.mp3`,
  peaks: `${base}/peaks.json`,
});

describe("cachedPeaksFor / knownDurationFor", () => {
  const peaksCache = { "set-x": { url: `${OLD}/peaks.json`, peaks: [0.1, 0.9] } };
  const durations = { "set-x": { src: `${OLD}/audio.mp3`, seconds: 5400 } };

  it("return the cached value while the set still points at the same file", () => {
    expect(cachedPeaksFor(peaksCache, setAt(OLD))).toEqual([0.1, 0.9]);
    expect(knownDurationFor(durations, setAt(OLD))).toBe(5400);
  });

  it("read as unknown once the set points at a re-upload's new URLs", () => {
    expect(cachedPeaksFor(peaksCache, setAt(NEW))).toBeUndefined();
    expect(knownDurationFor(durations, setAt(NEW))).toBeUndefined();
  });

  it("read as unknown for a set without peaks, or one never cached", () => {
    expect(cachedPeaksFor(peaksCache, { id: "set-x", peaks: undefined })).toBeUndefined();
    expect(cachedPeaksFor({}, setAt(OLD))).toBeUndefined();
    expect(knownDurationFor({}, setAt(OLD))).toBeUndefined();
  });
});

describe("setPeaks / setTrackDuration", () => {
  beforeEach(() => useStore.setState({ peaksCache: {}, durations: {} }));

  it("store one stamped entry per set, overwriting a stale one in place", () => {
    const { setPeaks, setTrackDuration } = useStore.getState();
    setPeaks("set-x", `${OLD}/peaks.json`, [0.5]);
    setPeaks("set-x", `${NEW}/peaks.json`, [0.7]);
    setTrackDuration("set-x", `${NEW}/audio.mp3`, 61);

    const { peaksCache, durations } = useStore.getState();
    expect(peaksCache).toEqual({ "set-x": { url: `${NEW}/peaks.json`, peaks: [0.7] } });
    expect(durations).toEqual({ "set-x": { src: `${NEW}/audio.mp3`, seconds: 61 } });
  });
});

describe("rehydrating peaksCache / durations", () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({ catalogueSets: sets });
  });

  // Entries saved before stamping carry no URL to check: they count as
  // missing (fetched / measured again), never as the current file's.
  it("keeps stamped entries and drops the old unstamped ones", async () => {
    localStorage.setItem(
      "format-player",
      JSON.stringify({
        state: {
          nowPlayingId: null,
          positions: {},
          peaksCache: {
            "set-old": [0.1, 0.2],
            "set-new": { url: `${NEW}/peaks.json`, peaks: [0.3] },
            "set-broken": { url: 42, peaks: [0.3] },
          },
          durations: {
            "set-old": 5400,
            "set-new": { src: `${NEW}/audio.mp3`, seconds: 61 },
          },
          offlineSets: {},
          hasRequestedPersist: false,
        },
        version: 0,
      }),
    );
    await useStore.persist.rehydrate();

    const { peaksCache, durations } = useStore.getState();
    expect(peaksCache).toEqual({ "set-new": { url: `${NEW}/peaks.json`, peaks: [0.3] } });
    expect(durations).toEqual({ "set-new": { src: `${NEW}/audio.mp3`, seconds: 61 } });
  });
});
