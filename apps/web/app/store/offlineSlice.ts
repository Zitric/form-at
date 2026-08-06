import type { MusicSet } from "@form-at/data/sets";
import type { StateCreator } from "zustand";
import { djs } from "~/data/djs";
import {
  type OfflineAudioEntry,
  deleteOfflineSetEntries,
  getAllOfflineEntries,
  putOfflineAudioPair,
} from "~/data/offline-audio";
import { type CatalogueSlice, getCatalogueSet } from "~/store/catalogueSlice";

// Offline audio download + IDB-backed state: `startDownload` (quota
// pre-flight, streaming fetch with progress, atomic IDB write of MP3 + peaks),
// `cancelDownload`, `removeOfflineSet`, and `reconcileFromIdb` (boot-time sync
// between IDB truth and persisted state, auto-purging catalogue orphans).
//
// Persistence boundary (see store/index.ts partializer): persist ONLY entries
// where `status === "saved"`, plus `hasRequestedPersist`. Mid-download state,
// failures and evictions are ephemeral, recomputed at boot from IDB — so a
// reload during a download reads as aborted rather than half-saved.

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

// Maps a download failure to the user-facing reason. The distinction
// matters because the reasons carry different fixes: "network" invites a
// retry, "quota" needs freed storage — conflating them tells the user to
// retry something a retry can't fix.
//
//   QuotaExceededError — the IDB write ran out of disk. The 1.5× pre-flight
//     usually catches this first, but `estimate()` is approximate, other
//     tabs/origins consume space concurrently, and some browsers don't
//     expose `estimate` at all (the pre-flight is skipped there — this
//     classification is the backstop).
//   RangeError — the ~100MB+ `new Uint8Array(bytesTotal)` preallocation
//     failed on a memory-constrained device. Strictly RAM rather than disk,
//     but the user-side reality matches quota ("this device can't hold this
//     set"), and a retry won't fix it either — so it maps to quota, not
//     network. Exported for unit tests.
export function classifyDownloadFailure(e: unknown): "network" | "quota" | "aborted" {
  if (e instanceof DOMException && e.name === "AbortError") return "aborted";
  if (e instanceof DOMException && e.name === "QuotaExceededError") return "quota";
  if (e instanceof RangeError) return "quota";
  return "network";
}

// Throttle Zustand updates during streaming download to once per percent of
// progress. Avoids thousands of re-renders per ~100MB download — UI granularity
// is integer percent anyway, no point firing more often.
function percentBucket(downloaded: number, total: number): number {
  return Math.floor((downloaded * 100) / total);
}

// Streaming GET with progress callback. Reads the actual `Content-Length`
// from the response headers (R2 exposes it via `Access-Control-Expose-Headers`)
// for buffer preallocation, so the size is always the truth from the wire,
// not the possibly-stale `sizeBytes` hint from `sets.ts`. Returns the size as
// an extra value so the caller can update the UI's `bytesTotal` once we
// actually know it.
//
// Don't add a HEAD pre-flight for the size: a browser-side
// `fetch(url, { method: "HEAD" })` against the R2 bucket fails with
// `net::ERR_FAILED` despite correct CORS config, for reasons never identified
// (TECH_DEBT.md item 15). GET works, and its response carries the size anyway.
async function streamWithProgress(
  url: string,
  signal: AbortSignal,
  onProgress: (downloaded: number, total: number) => void,
): Promise<{ blob: Blob; bytesTotal: number }> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`fetch ${url}: HTTP ${response.status}`);
  if (!response.body) throw new Error(`fetch ${url}: no response body`);

  const clHeader = response.headers.get("Content-Length");
  const bytesTotal = clHeader ? Number(clHeader) : Number.NaN;
  if (!Number.isFinite(bytesTotal) || bytesTotal <= 0) {
    throw new Error(`fetch ${url}: no usable Content-Length in response`);
  }

  // Single preallocated buffer: avoids the double-retention
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
      // Server response exceeded its own declared Content-Length. Refuse
      // rather than overflowing the buffer — this means the server is
      // misbehaving, not the client.
      throw new Error(`fetch ${url}: response exceeded declared Content-Length`);
    }
    buffer.set(value, offset);
    offset += value.byteLength;
    const bucket = percentBucket(offset, bytesTotal);
    if (bucket > lastBucket) {
      lastBucket = bucket;
      onProgress(offset, bytesTotal);
    }
  }

  // One Blob wrap, then we let `buffer` go out of scope at function return.
  // The Blob aliases or copies internally; either way we don't keep a
  // second JS-visible reference to the bytes.
  return {
    blob: new Blob([buffer], { type: response.headers.get("Content-Type") ?? "" }),
    bytesTotal,
  };
}

// Warm `artwork-v1` for every page that describes a saved set's world so
// they render offline even if the user never visited them online first:
//   - set artwork (list cards, /sets/$setId, FullPlayer)
//   - the DJ photo for the set's artist (/djs/$djId)
//
// Fires plain GETs through the SW's artwork-v1 SWR route, which stays the
// single writer for that cache. Four variants per image (640/1080 × avif/webp)
// mirror `components/Image.tsx` — keep the two in step.
//
// DJ photos must be warmed too, not just set artwork: an online-first visit
// SWR-caches the photo anyway, but a direct-to-offline first visit finds no
// entry and renders a broken image.
//
// Set-to-DJ resolution via `dj.setIds`. A set wired into no DJ resolves none
// and skips the photo warm — graceful, but flagged in dev so a data-authoring
// gap stays visible.
//
// Best-effort: errors swallowed per-URL so one 404 can't fail the batch (the
// call site also catches). TECH_DEBT 16 covers orphan-on-removal.
//
// Exported for unit tests — the DJ-photo-warmed-with-set invariant regresses
// invisibly without a test keeping the two coupled.
export async function warmSetVisuals(musicSet: MusicSet): Promise<void> {
  const dj = djs.find((d) => d.setIds?.includes(musicSet.id));
  if (!dj && process.env.NODE_ENV === "development") {
    console.warn(
      `[offline] warmSetVisuals: no DJ resolves to set '${musicSet.id}' — the artist's /djs/… page won't be warmed for offline. Wire it into a dj.setIds in data/djs.ts.`,
    );
  }

  const variants = ["640.avif", "1080.avif", "640.webp", "1080.webp"];
  const urls: string[] = [];
  if (musicSet.artwork) {
    for (const v of variants) urls.push(`/images/${musicSet.artwork}-${v}`);
  }
  if (dj?.photo) {
    for (const v of variants) urls.push(`/images/${dj.photo}-${v}`);
  }
  if (urls.length === 0) return;

  await Promise.all(urls.map((url) => fetch(url).catch(() => {})));
}

export const createOfflineSlice: StateCreator<
  OfflineSlice & CatalogueSlice,
  [],
  [],
  OfflineSlice
> = (set, get) => ({
  offlineSets: {},
  activeDownloadId: null,
  hasRequestedPersist: false,

  setOfflineState: (setId, state) =>
    set((s) => ({ offlineSets: { ...s.offlineSets, [setId]: state } })),

  startDownload: async (setId) => {
    if (get().activeDownloadId) throw new Error("ONE_DOWNLOAD_AT_A_TIME");
    const musicSet = getCatalogueSet(get().catalogueSets, setId);
    if (!musicSet) throw new Error(`UNKNOWN_SET: ${setId}`);
    // sizeBytes is the source of size truth for the QUOTA pre-flight (display
    // hint + quota check). The actual buffer preallocation reads the real
    // Content-Length from the GET response — see `streamWithProgress`. If a
    // set has no hint, we refuse explicitly rather than silently falling
    // back to HEAD (which currently fails in the browser for unidentified
    // reasons — see the `streamWithProgress` comment for the curl-vs-browser
    // discrepancy).
    if (musicSet.sizeBytes === undefined) {
      throw new Error(`SIZE_NOT_CONFIGURED: ${setId}`);
    }

    const controller = new AbortController();
    activeControllers.set(setId, controller);
    set({ activeDownloadId: setId });

    try {
      // Quota pre-flight uses `sizeBytes` as a generous-enough estimate of
      // total disk needed. The peaks JSON (~few hundred KB) is absorbed by
      // the `× 1.5` headroom — well within tolerance. If sizeBytes is
      // slightly stale (R2 file changed), the headroom also absorbs that;
      // the buffer preallocation inside `streamWithProgress` reads the real
      // Content-Length from the response, so the download itself stays
      // correct regardless of hint drift.
      // `estimate` is missing on older WebKit / some Android WebViews —
      // skip the pre-flight there rather than throwing (a TypeError here
      // would otherwise surface as a bogus "network" failure). The IDB write
      // itself is the backstop: a real quota hit lands in the catch below
      // and `classifyDownloadFailure` labels it correctly.
      const totalBytes = musicSet.sizeBytes;
      if (navigator.storage?.estimate) {
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
      }

      // Transition to downloading; progress starts at 0. `bytesTotal` here
      // is the hint — `streamWithProgress` corrects it from the response's
      // real Content-Length on its first progress callback, so any hint
      // drift self-corrects within the first 1% bucket.
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

      const { blob: mp3Blob } = await streamWithProgress(
        musicSet.src,
        controller.signal,
        (downloaded, total) => {
          const cur = get().offlineSets[setId];
          if (cur?.status !== "downloading") return;
          set((s) => ({
            offlineSets: {
              ...s.offlineSets,
              [setId]: { ...cur, bytesDownloaded: downloaded, bytesTotal: total },
            },
          }));
        },
      );

      // Peaks JSON: small (~few hundred KB), so we don't bother with streaming
      // progress — a plain fetch + blob is simpler and the download UI is
      // already showing the MP3's 100% by the time this runs. Failure here
      // throws and lands in the outer catch → `failed/network` state, which
      // means atomic semantics are preserved (no half-saved entry: the IDB
      // write below never runs).
      let peaksBlob: Blob | null = null;
      if (musicSet.peaks) {
        const peaksResp = await fetch(musicSet.peaks, { signal: controller.signal });
        if (!peaksResp.ok) {
          throw new Error(`fetch peaks ${musicSet.peaks}: HTTP ${peaksResp.status}`);
        }
        peaksBlob = await peaksResp.blob();
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

      // Warm artwork-v1 for every page describing this set's world (set
      // artwork + DJ photo) so they render offline without a prior online
      // visit. Strictly post-IDB-commit + post-state-transition: image
      // errors must not flip the audio's state back to failed. Fire-and-
      // forget so the button hits [ saved ] instantly; warming runs in
      // the background.
      warmSetVisuals(musicSet).catch(() => {});

      // First-ever save: request persistent storage (eviction-resistant under
      // disk pressure on Chrome/Android; iOS ignores). Fire-and-forget — the
      // outcome doesn't affect the save itself, and Chrome may auto-grant
      // based on engagement signals.
      if (!get().hasRequestedPersist) {
        set({ hasRequestedPersist: true });
        navigator.storage.persist?.().catch(() => {});
      }
    } catch (e) {
      set((s) => ({
        offlineSets: {
          ...s.offlineSets,
          [setId]: {
            status: "failed",
            reason: classifyDownloadFailure(e),
            lastAttempt: Date.now(),
          },
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
    const musicSet = getCatalogueSet(get().catalogueSets, setId);
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
    // Structural guard, kept here rather than left to OfflineReconciler's own
    // gate — that's the only caller today, but it shouldn't be the only thing
    // between a future caller and the destructive branch below. Strict
    // `!== true`, not just falsy, so a store that never composed
    // CatalogueSlice (isolated tests) fails the same safe way as one that
    // hasn't settled yet.
    //
    // This does NOT make pass 2's catalogue-membership purge safe on its own —
    // that needs `catalogueConfirmed`, checked separately in pass 2 below.
    if (get().catalogueReady !== true) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[offline] reconcileFromIdb skipped — catalogue not ready yet (this should self-resolve once the boot fetch settles)",
        );
      }
      return;
    }

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
    // catalogue-removed (no catalogue match) entries get queued for
    // auto-purge. Safe to treat a miss here as genuine removal ONLY when
    // `catalogueConfirmed` is true — i.e. this session's live fetch actually
    // SUCCEEDED, not merely settled (`catalogueReady`, checked above, also
    // goes true on a failed/timed-out fetch, which tells us nothing about
    // whether `catalogueSets` is complete). Without this extra check, a
    // failed boot fetch on a device whose persisted catalogueSets was
    // cleared would see the bare snapshot, find a genuinely-saved
    // recently-uploaded set missing from it, and permanently delete real
    // user data over a network blip — see catalogueSlice.ts's comment on
    // why `catalogueReady` alone is the wrong gate for this.
    for (const [setId, entries] of bySetId) {
      const catalogueSet = getCatalogueSet(get().catalogueSets, setId);
      if (!catalogueSet) {
        if (get().catalogueConfirmed !== true) {
          // Unconfirmed catalogue — we genuinely don't know whether this id
          // was removed or simply hasn't loaded yet. Leave it alone
          // entirely: no purge, no state change either way.
          continue;
        }
        // Set is no longer in the catalogue — no UI path to play it anymore.
        // Queue the URLs for deletion and DON'T add to state. See TECH_DEBT
        // item 13 for the policy + future revision criteria.
        for (const e of entries) orphanUrlsToPurge.push(e.url);
        continue;
      }
      // URL-migration guard (TECH_DEBT 19, host swap to the custom domain;
      // also self-heals future object renames like TECH_DEBT 14). The SW
      // looks entries up by EXACT URL, so bytes stored under a URL the
      // catalogue no longer emits are unreachable — without this check the
      // state would keep saying "saved" while offline playback silently
      // failed. Stale entries are purged; a set whose MP3 went stale flips
      // to `evicted`, which is the documented force-re-download path — the
      // existing "↻ re-save · was N MB" UX is the user notice.
      const catalogueUrls = new Set(
        [catalogueSet.src, catalogueSet.peaks].filter((u): u is string => Boolean(u)),
      );
      const live = entries.filter((e) => catalogueUrls.has(e.url));
      for (const e of entries) {
        if (!catalogueUrls.has(e.url)) orphanUrlsToPurge.push(e.url);
      }

      const existing = persisted[setId];
      const hasPlayableMp3 = live.some((e) => e.kind === "mp3");
      if (!hasPlayableMp3) {
        if (existing?.status === "saved") {
          updates[setId] = {
            status: "evicted",
            lastKnownSavedAt: existing.savedAt,
            lastKnownBytes: existing.bytesTotal,
          };
        }
        continue;
      }
      // Stale peaks alone (e.g. only the JSON was renamed): purged above,
      // set stays saved — the seeker falls back to the plain slider.
      if (!existing || existing.status !== "saved") {
        const bytesTotal = live.reduce((sum, e) => sum + e.bytesTotal, 0);
        const savedAt = Math.min(...live.map((e) => e.savedAt));
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
