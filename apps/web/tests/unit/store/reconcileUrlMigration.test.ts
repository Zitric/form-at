import { sets } from "@form-at/data/sets";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { type CatalogueSlice, createCatalogueSlice } from "~/store/catalogueSlice";
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

const entry = (url: string, kind: "mp3" | "peaks", setId = testSet.id) => ({
  url,
  setId,
  kind,
  blob: new Blob(["x"]),
  bytesTotal: 1000,
  contentType: kind === "mp3" ? "audio/mpeg" : "application/json",
  savedAt: 111,
});

// Composes CatalogueSlice alongside OfflineSlice — `reconcileFromIdb`
// now gates on `catalogueReady`, so an isolated OfflineSlice-only store would
// silently no-op every call here. `catalogueReady: true, catalogueConfirmed:
// true` matches most of these tests' intent: they're exercising the purge
// logic itself, not either readiness/confirmation gate (those get their own
// dedicated tests below — `catalogueReady` and `catalogueConfirmed` answer
// different questions, see catalogueSlice.ts).
function makeStore(catalogueReady = true, catalogueConfirmed = true) {
  const store = create<OfflineSlice & CatalogueSlice>()((...a) => ({
    ...createOfflineSlice(...a),
    ...createCatalogueSlice(...a),
  }));
  store.setState({
    offlineSets: { [testSet.id]: { status: "saved", bytesTotal: 2000, savedAt: 111 } },
    catalogueReady,
    catalogueConfirmed,
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

  it("catalogueReady: false — no-ops entirely, nothing read from IDB or purged (PR3 safety guard)", async () => {
    // Same old-host fixture as the very first test above, which — with
    // catalogueReady: true — purges and evicts. Here it must do NOTHING:
    // this is the exact scenario the guard exists for (a momentarily
    // incomplete catalogue must never be treated as ground truth for
    // deciding a saved set was "removed").
    getAllOfflineEntries.mockResolvedValue([
      entry(oldSrc, "mp3"),
      ...(oldPeaks ? [entry(oldPeaks, "peaks")] : []),
    ]);
    const store = makeStore(false);

    await store.getState().reconcileFromIdb();

    expect(store.getState().offlineSets[testSet.id]).toEqual({
      status: "saved",
      bytesTotal: 2000,
      savedAt: 111,
    });
    expect(getAllOfflineEntries).not.toHaveBeenCalled();
    expect(deleteOfflineSetEntries).not.toHaveBeenCalled();
  });

  // The bug this locks: `catalogueReady` goes true on a FAILED/timed-out
  // boot fetch too, not just a successful one (see CatalogueSync.tsx) — at
  // that point `catalogueSets` is whatever was already known, which is NOT
  // confirmed complete. An id genuinely saved by the user but missing from
  // that unconfirmed catalogue (e.g. uploaded since the last deploy, on a
  // device whose persisted catalogueSets was cleared) must NOT be purged.
  it("catalogueReady: true, catalogueConfirmed: false — an unrecognized id is left alone, nothing purged", async () => {
    const unknownId = "set-999-uploaded-since-last-deploy";
    getAllOfflineEntries.mockResolvedValue([entry(`${OLD_HOST}/999/audio.mp3`, "mp3", unknownId)]);
    const store = makeStore(true, false);
    store.setState({
      offlineSets: {
        ...store.getState().offlineSets,
        [unknownId]: { status: "saved", bytesTotal: 5000, savedAt: 222 },
      },
    });

    await store.getState().reconcileFromIdb();

    expect(store.getState().offlineSets[unknownId]).toEqual({
      status: "saved",
      bytesTotal: 5000,
      savedAt: 222,
    });
    expect(deleteOfflineSetEntries).not.toHaveBeenCalled();
  });

  // Complements the test above: once the catalogue IS confirmed (a genuinely
  // successful live fetch), an id that still doesn't resolve really is gone
  // — the purge must still fire in that case, proving the fix narrows the
  // gate rather than disabling the purge outright.
  it("catalogueReady: true, catalogueConfirmed: true — an unrecognized id IS purged", async () => {
    const unknownId = "set-999-genuinely-removed";
    const url = `${OLD_HOST}/999/audio.mp3`;
    getAllOfflineEntries.mockResolvedValue([entry(url, "mp3", unknownId)]);
    const store = makeStore(true, true);
    store.setState({
      offlineSets: {
        ...store.getState().offlineSets,
        [unknownId]: { status: "saved", bytesTotal: 5000, savedAt: 222 },
      },
    });

    await store.getState().reconcileFromIdb();

    // Pass 1 already found a matching IDB entry for this id, so the
    // Zustand-level "saved" state is untouched either way (it only flips to
    // `evicted` on the NEXT reconciliation, once IDB genuinely has no
    // record) — the actual purge this test locks is the IDB delete call
    // below, which is what pass 2's comment means by "queue for deletion."
    expect(store.getState().offlineSets[unknownId]).toEqual({
      status: "saved",
      bytesTotal: 5000,
      savedAt: 222,
    });
    expect(deleteOfflineSetEntries.mock.calls.flat(2)).toEqual([url]);
  });
});
