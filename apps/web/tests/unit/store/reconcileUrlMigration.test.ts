import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { sets } from "~/data/sets";
import { type OfflineSlice, createOfflineSlice } from "~/store/offlineSlice";

// TECH_DEBT 19 migration lock: IDB entries are keyed by full URL and the SW
// looks them up by EXACT URL. After the host swap (dev URL →
// cdn.formatglasgow.com), entries saved under the old host are unreachable
// — reconcileFromIdb must purge them and flip the set to `evicted` (the
// force-re-download path) instead of leaving a lying "saved" state. The
// same guard self-heals any future object rename (TECH_DEBT 14).

const OLD_HOST = "https://pub-e15e86da649d4c91b6666141bfe67664.r2.dev";

const testSet = sets[0];
if (!testSet) throw new Error("catalogue empty");
const oldSrc = `${OLD_HOST}/002/${testSet.src.split("/").pop()}`;
const oldPeaks = testSet.peaks ? `${OLD_HOST}/002/${testSet.peaks.split("/").pop()}` : null;

const getAllOfflineEntries = vi.fn();
const deleteOfflineSetEntries = vi.fn().mockResolvedValue(undefined);
vi.mock("~/data/offline-audio", () => ({
  getAllOfflineEntries: (...a: unknown[]) => getAllOfflineEntries(...a),
  deleteOfflineSetEntries: (...a: unknown[]) => deleteOfflineSetEntries(...a),
  putOfflineAudioPair: vi.fn(),
}));

const entry = (url: string, kind: "mp3" | "peaks") => ({
  url,
  setId: testSet.id,
  kind,
  blob: new Blob(["x"]),
  bytesTotal: 1000,
  contentType: kind === "mp3" ? "audio/mpeg" : "application/json",
  savedAt: 111,
});

function makeStore() {
  const store = create<OfflineSlice>()(createOfflineSlice);
  store.setState({
    offlineSets: { [testSet.id]: { status: "saved", bytesTotal: 2000, savedAt: 111 } },
  });
  return store;
}

beforeEach(() => {
  getAllOfflineEntries.mockReset();
  deleteOfflineSetEntries.mockClear();
});

describe("reconcileFromIdb URL migration", () => {
  it("old-host entries: purged from IDB, state flips saved → evicted (force re-download)", async () => {
    getAllOfflineEntries.mockResolvedValue([
      entry(oldSrc, "mp3"),
      ...(oldPeaks ? [entry(oldPeaks, "peaks")] : []),
    ]);
    const store = makeStore();

    await store.getState().reconcileFromIdb();

    expect(store.getState().offlineSets[testSet.id]).toEqual({
      status: "evicted",
      lastKnownSavedAt: 111,
      lastKnownBytes: 2000,
    });
    const purged = deleteOfflineSetEntries.mock.calls.flat(2);
    expect(purged).toContain(oldSrc);
    if (oldPeaks) expect(purged).toContain(oldPeaks);
  });

  it("current-host entries: state stays saved, nothing purged", async () => {
    getAllOfflineEntries.mockResolvedValue([
      entry(testSet.src, "mp3"),
      ...(testSet.peaks ? [entry(testSet.peaks, "peaks")] : []),
    ]);
    const store = makeStore();

    await store.getState().reconcileFromIdb();

    expect(store.getState().offlineSets[testSet.id]?.status).toBe("saved");
    expect(deleteOfflineSetEntries).not.toHaveBeenCalled();
  });

  it("stale peaks with a live mp3: peaks purged, set stays saved", async () => {
    if (!oldPeaks) return;
    getAllOfflineEntries.mockResolvedValue([entry(testSet.src, "mp3"), entry(oldPeaks, "peaks")]);
    const store = makeStore();

    await store.getState().reconcileFromIdb();

    expect(store.getState().offlineSets[testSet.id]?.status).toBe("saved");
    expect(deleteOfflineSetEntries.mock.calls.flat(2)).toEqual([oldPeaks]);
  });
});
