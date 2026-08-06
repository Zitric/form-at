// IDB wrapper for offline audio storage.
//
// IDB rather than Cache Storage: WebKit / iOS Safari is unreliable with large
// blob entries in Cache Storage. IDB has the same origin-level quota, no
// documented per-entry cap, and is the workaround the Workbox community
// recommends (GoogleChrome/workbox#3004). Same API in both Window and
// ServiceWorkerGlobalScope, which this needs — the page writes, the SW audio
// route reads.
//
// Database: `audio-v1` with a single `entries` object store keyed by the R2
// URL string. Secondary index on `setId` so reconciliation can list every
// blob belonging to a set in one query (MP3 + peaks).
//
// Storage shape — one entry per resource (an MP3 + its peaks JSON = 2 entries):
//   url, setId, kind ("mp3" | "peaks"), blob, bytesTotal, contentType, savedAt.
//
// The blob is the actual content. `bytesTotal` is denormalized from `blob.size`
// so the SW handler doesn't have to read the blob just to set Content-Length.

import { type DBSchema, type IDBPDatabase, openDB } from "idb";

// Not exported — used only by `OfflineAudioEntry` below, in this file.
type OfflineAudioKind = "mp3" | "peaks";

export type OfflineAudioEntry = {
  url: string;
  setId: string;
  kind: OfflineAudioKind;
  blob: Blob;
  bytesTotal: number;
  contentType: string;
  savedAt: number;
};

interface OfflineAudioDB extends DBSchema {
  entries: {
    key: string;
    value: OfflineAudioEntry;
    indexes: { "by-setId": string };
  };
}

const DB_NAME = "audio-v1";
const STORE = "entries";
const VERSION = 1;

let dbPromise: Promise<IDBPDatabase<OfflineAudioDB>> | null = null;

// Not exported — every caller lives in this file (knip flagged it as an
// unused export, correctly: nothing outside this module ever imported it).
function openOfflineAudioDb(): Promise<IDBPDatabase<OfflineAudioDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineAudioDB>(DB_NAME, VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: "url" });
        store.createIndex("by-setId", "setId");
      },
    });
  }
  return dbPromise;
}

export async function getOfflineAudio(url: string): Promise<OfflineAudioEntry | undefined> {
  try {
    const db = await openOfflineAudioDb();
    return await db.get(STORE, url);
  } catch {
    // IDB open / read failed (storage corruption, browser bug, private mode).
    // The SW handler treats undefined as "not saved" and passes through to
    // network — the right degradation either way. We don't surface the error.
    return undefined;
  }
}

export async function putOfflineAudioPair(
  mp3: OfflineAudioEntry,
  peaks: OfflineAudioEntry | null,
): Promise<void> {
  // Atomic write of both entries in a single transaction. If either put throws
  // (e.g. quota mid-write), the transaction rolls back automatically — neither
  // entry lands. Failure → caller marks state `failed`. Restart is a clean
  // retry from zero (no partial-saved state to reconcile).
  //
  // Standing caveat, not yet observed in practice: IDB transactions auto-close
  // if a 100MB+ structured-clone serialization tick exceeds the activity window.
  // If that ever surfaces, fall back to per-put with explicit cleanup of the MP3
  // entry on peaks failure.
  const db = await openOfflineAudioDb();
  const tx = db.transaction(STORE, "readwrite");
  await tx.store.put(mp3);
  if (peaks) await tx.store.put(peaks);
  await tx.done;
}

export async function deleteOfflineSetEntries(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  const db = await openOfflineAudioDb();
  const tx = db.transaction(STORE, "readwrite");
  await Promise.all(urls.map((url) => tx.store.delete(url)));
  await tx.done;
}

export async function getAllOfflineEntries(): Promise<OfflineAudioEntry[]> {
  try {
    const db = await openOfflineAudioDb();
    return await db.getAll(STORE);
  } catch {
    return [];
  }
}
