import type { StateCreator } from "zustand";
import {
  type OfflineAudioEntry,
  deleteOfflineSetEntries,
  getAllOfflineEntries,
  putOfflineAudioPair,
} from "~/data/offline-audio";
import { getSet } from "~/data/sets";

// Phase 4 chunk 3b — offline audio download + IDB-backed state.
//
// Responsibilities:
//   1. `startDownload` — HEAD, quota pre-flight, streaming fetch with
//      progress, atomic IDB write of MP3 + peaks.
//   2. `cancelDownload` — abort in-flight, transition to `failed/aborted`.
//   3. `removeOfflineSet` — drop IDB entries, transition to `not-saved`.
//   4. `reconcileFromIdb` — boot-time sync between IDB truth and persisted
//      state, with auto-purge of catalogue-orphaned entries.
//
// Persistence boundary (see store/index.ts partializer):
//   - Persist ONLY entries where `status === "saved"` + `hasRequestedPersist`.
//   - Mid-download state, failures, evictions are ephemeral — recomputed at
//     boot from IDB. A reload during a download = aborted; the entry doesn't
//     show as half-saved on next visit.

export type OfflineSetState =
  | { status: "not-saved" }
  | { status: "downloading"; bytesDownloaded: number; bytesTotal: number; startedAt: number }
  | { status: "saved"; bytesTotal: number; savedAt: number }
  | {
      status: "failed";
      reason: "network" | "quota" | "aborted";
      lastAttempt: number;
      quotaShortfallBytes?: number;
    }
  | { status: "evicted"; lastKnownSavedAt: number; lastKnownBytes: number };

export type OfflineSlice = {
  offlineSets: Record<string, OfflineSetState>;
  activeDownloadId: string | null;
  hasRequestedPersist: boolean;

  startDownload: (setId: string) => Promise<void>;
  cancelDownload: (setId: string) => void;
  removeOfflineSet: (setId: string) => Promise<void>;
  reconcileFromIdb: () => Promise<void>;
  setOfflineState: (setId: string, state: OfflineSetState) => void;
};

// AbortControllers live in module scope, not in Zustand state — they hold
// non-serializable browser objects and would crash persist's structured clone.
const activeControllers = new Map<string, AbortController>();

const QUOTA_SAFETY_MULTIPLIER = 1.5;

// Throttle Zustand updates during streaming download to once per percent of
// progress. Avoids thousands of re-renders per ~100MB download — UI granularity
// is integer percent anyway, no point firing more often.
function percentBucket(downloaded: number, total: number): number {
  return Math.floor((downloaded * 100) / total);
}

async function streamWithProgress(
  url: string,
  signal: AbortSignal,
  bytesTotal: number,
  onProgress: (downloaded: number) => void,
): Promise<Blob> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`fetch ${url}: HTTP ${response.status}`);
  if (!response.body) throw new Error(`fetch ${url}: no response body`);

  // Single preallocated buffer (chunk 3b option A): avoids the double-retention
  // of `chunks: Uint8Array[]` + `new Blob(chunks)` aliasing/copying. Peak is
  // ~1× total bytes; worst case ~2× briefly during `new Blob([buffer])` if the
  // engine copies rather than aliases (Chrome aliases; WebKit unverified — see
  // TECH_DEBT item 12 for the iOS validation plan).
  const buffer = new Uint8Array(bytesTotal);
  let offset = 0;
  let lastBucket = -1;

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.byteLength > bytesTotal) {
      // Server lied about Content-Length, or the URL serves more bytes than
      // HEAD advertised. Refuse rather than overflowing the buffer.
      throw new Error(`fetch ${url}: response exceeded declared Content-Length`);
    }
    buffer.set(value, offset);
    offset += value.byteLength;
    const bucket = percentBucket(offset, bytesTotal);
    if (bucket > lastBucket) {
      lastBucket = bucket;
      onProgress(offset);
    }
  }

  // One Blob wrap, then we let `buffer` go out of scope at function return.
  // The Blob aliases or copies internally; either way we don't keep a
  // second JS-visible reference to the bytes.
  return new Blob([buffer], { type: response.headers.get("Content-Type") ?? "" });
}

async function headContentLength(url: string, signal: AbortSignal): Promise<number> {
  const response = await fetch(url, { method: "HEAD", signal });
  if (!response.ok) throw new Error(`HEAD ${url}: HTTP ${response.status}`);
  const cl = response.headers.get("Content-Length");
  const n = cl ? Number(cl) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) throw new Error(`HEAD ${url}: no usable Content-Length`);
  return n;
}

export const createOfflineSlice: StateCreator<OfflineSlice, [], [], OfflineSlice> = (set, get) => ({
  offlineSets: {},
  activeDownloadId: null,
  hasRequestedPersist: false,

  setOfflineState: (setId, state) =>
    set((s) => ({ offlineSets: { ...s.offlineSets, [setId]: state } })),

  startDownload: async (setId) => {
    if (get().activeDownloadId) throw new Error("ONE_DOWNLOAD_AT_A_TIME");
    const musicSet = getSet(setId);
    if (!musicSet) throw new Error(`UNKNOWN_SET: ${setId}`);

    const controller = new AbortController();
    activeControllers.set(setId, controller);
    set({ activeDownloadId: setId });

    try {
      // HEAD both URLs (peaks optional) so we know the total size BEFORE the
      // quota check. Skip peaks if the set doesn't declare one.
      const mp3Bytes = await headContentLength(musicSet.src, controller.signal);
      const peaksBytes = musicSet.peaks
        ? await headContentLength(musicSet.peaks, controller.signal)
        : 0;
      const totalBytes = mp3Bytes + peaksBytes;

      // Honest quota pre-flight — no paternalism, just refuse cleanly if
      // there isn't room. `× 1.5` headroom avoids mid-download
      // QuotaExceededError when `estimate()` underestimates available space.
      const { quota, usage } = await navigator.storage.estimate();
      const available = (quota ?? 0) - (usage ?? 0);
      const requiredWithHeadroom = totalBytes * QUOTA_SAFETY_MULTIPLIER;
      if (available < requiredWithHeadroom) {
        set((s) => ({
          offlineSets: {
            ...s.offlineSets,
            [setId]: {
              status: "failed",
              reason: "quota",
              lastAttempt: Date.now(),
              quotaShortfallBytes: requiredWithHeadroom - available,
            },
          },
        }));
        return;
      }

      // Transition to downloading; progress starts at 0.
      set((s) => ({
        offlineSets: {
          ...s.offlineSets,
          [setId]: {
            status: "downloading",
            bytesDownloaded: 0,
            bytesTotal: totalBytes,
            startedAt: Date.now(),
          },
        },
      }));

      const mp3Blob = await streamWithProgress(
        musicSet.src,
        controller.signal,
        mp3Bytes,
        (downloaded) => {
          const cur = get().offlineSets[setId];
          if (cur?.status !== "downloading") return;
          set((s) => ({
            offlineSets: {
              ...s.offlineSets,
              [setId]: { ...cur, bytesDownloaded: downloaded },
            },
          }));
        },
      );

      let peaksBlob: Blob | null = null;
      if (musicSet.peaks) {
        peaksBlob = await streamWithProgress(
          musicSet.peaks,
          controller.signal,
          peaksBytes,
          (downloaded) => {
            const cur = get().offlineSets[setId];
            if (cur?.status !== "downloading") return;
            set((s) => ({
              offlineSets: {
                ...s.offlineSets,
                [setId]: { ...cur, bytesDownloaded: mp3Bytes + downloaded },
              },
            }));
          },
        );
      }

      const now = Date.now();
      const mp3Entry: OfflineAudioEntry = {
        url: musicSet.src,
        setId,
        kind: "mp3",
        blob: mp3Blob,
        bytesTotal: mp3Blob.size,
        contentType: "audio/mpeg",
        savedAt: now,
      };
      const peaksEntry: OfflineAudioEntry | null =
        peaksBlob && musicSet.peaks
          ? {
              url: musicSet.peaks,
              setId,
              kind: "peaks",
              blob: peaksBlob,
              bytesTotal: peaksBlob.size,
              contentType: "application/json",
              savedAt: now,
            }
          : null;

      await putOfflineAudioPair(mp3Entry, peaksEntry);

      set((s) => ({
        offlineSets: {
          ...s.offlineSets,
          [setId]: {
            status: "saved",
            bytesTotal: mp3Blob.size + (peaksBlob?.size ?? 0),
            savedAt: now,
          },
        },
      }));

      // First-ever save: request persistent storage (eviction-resistant under
      // disk pressure on Chrome/Android; iOS ignores). Fire-and-forget — the
      // outcome doesn't affect the save itself, and Chrome may auto-grant
      // based on engagement signals.
      if (!get().hasRequestedPersist) {
        set({ hasRequestedPersist: true });
        navigator.storage.persist?.().catch(() => {});
      }
    } catch (e) {
      const reason: "network" | "aborted" =
        e instanceof DOMException && e.name === "AbortError" ? "aborted" : "network";
      set((s) => ({
        offlineSets: {
          ...s.offlineSets,
          [setId]: { status: "failed", reason, lastAttempt: Date.now() },
        },
      }));
    } finally {
      activeControllers.delete(setId);
      set({ activeDownloadId: null });
    }
  },

  cancelDownload: (setId) => {
    const controller = activeControllers.get(setId);
    if (!controller) return;
    controller.abort();
    // State transition happens in startDownload's catch/finally — don't
    // duplicate it here.
  },

  removeOfflineSet: async (setId) => {
    const musicSet = getSet(setId);
    const urls: string[] = [];
    if (musicSet) {
      urls.push(musicSet.src);
      if (musicSet.peaks) urls.push(musicSet.peaks);
    }
    if (urls.length > 0) await deleteOfflineSetEntries(urls);
    set((s) => ({
      offlineSets: { ...s.offlineSets, [setId]: { status: "not-saved" } },
    }));
  },

  reconcileFromIdb: async () => {
    let allEntries: OfflineAudioEntry[];
    try {
      allEntries = await getAllOfflineEntries();
    } catch {
      // IDB open failure — leave state alone. The audio handler degrades
      // (network pass-through) and persisted state stays as-is for next boot.
      return;
    }

    // Group entries by setId so MP3 + peaks for the same set are counted
    // together for bytesTotal / savedAt.
    const bySetId = new Map<string, OfflineAudioEntry[]>();
    for (const e of allEntries) {
      const list = bySetId.get(e.setId);
      if (list) list.push(e);
      else bySetId.set(e.setId, [e]);
    }

    const updates: Record<string, OfflineSetState> = {};
    const persisted = get().offlineSets;
    const orphanUrlsToPurge: string[] = [];

    // Pass 1: persisted-saved entries — confirm or mark evicted.
    for (const [setId, state] of Object.entries(persisted)) {
      if (state.status !== "saved") continue;
      const idbEntries = bySetId.get(setId);
      if (!idbEntries) {
        // Persisted as saved, but IDB has no record — eviction occurred. Keep
        // the bytes/savedAt as `lastKnown*` so the UI can show "was 104MB"
        // honestly rather than silently flipping back to not-saved.
        updates[setId] = {
          status: "evicted",
          lastKnownSavedAt: state.savedAt,
          lastKnownBytes: state.bytesTotal,
        };
      }
      // else: persisted-saved matches IDB — no-op, state already correct.
    }

    // Pass 2: IDB entries — orphans (no persisted state) become saved;
    // catalogue-removed (no `getSet`) entries get queued for auto-purge.
    for (const [setId, entries] of bySetId) {
      const catalogueSet = getSet(setId);
      if (!catalogueSet) {
        // Set is no longer in sets.ts — no UI path to play it anymore. Queue
        // the URLs for deletion and DON'T add to state. See TECH_DEBT item 13
        // for the policy + future revision criteria.
        for (const e of entries) orphanUrlsToPurge.push(e.url);
        continue;
      }
      const existing = persisted[setId];
      if (!existing || existing.status !== "saved") {
        const bytesTotal = entries.reduce((sum, e) => sum + e.bytesTotal, 0);
        const savedAt = Math.min(...entries.map((e) => e.savedAt));
        updates[setId] = { status: "saved", bytesTotal, savedAt };
      }
    }

    if (orphanUrlsToPurge.length > 0) {
      console.warn(
        "[offline] auto-purging IDB entries for sets no longer in catalogue:",
        orphanUrlsToPurge,
      );
      try {
        await deleteOfflineSetEntries(orphanUrlsToPurge);
      } catch {
        // Purge failed — entries stay until next reconciliation. Not fatal.
      }
    }

    if (Object.keys(updates).length > 0) {
      set((s) => ({ offlineSets: { ...s.offlineSets, ...updates } }));
    }
  },
});
