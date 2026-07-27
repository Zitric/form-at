// IDB-backed queue for `/api/signal` play-tracking beacons that failed to
// send (offline at call time, or the browser rejected `sendBeacon` outright)
// — Phase 4.5, TECH_DEBT 4. Today, a failed beacon is just lost; offline
// playback of a saved set (Phase 4's whole point) should still count once
// connectivity returns.
//
// Same Window/ServiceWorkerGlobalScope-shared IDB wrapper pattern as
// `offline-audio.ts` (module-level singleton `dbPromise`, private
// `openXxxDb()`, plain async CRUD functions) — this module is imported
// directly by both the page (`useAudioPlayer.ts`'s enqueue path,
// `BeaconQueueFlusher.tsx`'s fallback replay) and `sw.ts` (Background
// Sync's replay).
//
// Two replay paths, because Background Sync coverage is partial (verified
// against caniuse, 2026-07-23: Safari — desktop AND iOS — and Firefox do
// not support it at all; ~77% global support, Chromium-only in practice):
//   1. Primary — a Background Sync registration (see `queueSignalForReplay`
//      below) lets `sw.ts`'s `sync` handler replay the queue even if the
//      page has since closed, on any supporting browser.
//   2. Fallback — `BeaconQueueFlusher.tsx` replays on mount (covers
//      reopening the app after being offline) and on the `online` window
//      event (covers connectivity returning while the app stays open), for
//      browsers with no Background Sync at all.
// Both read this same queue; whichever fires first for a given entry wins,
// the other finds an empty queue.

import { type DBSchema, type IDBPDatabase, openDB } from "idb";

export type QueuedSignalPayload = {
  setId: string;
  setTitle: string;
  setArtist: string;
  listenedSeconds: number;
  isOffline: boolean;
};

export type QueuedSignal = {
  id: number;
  payload: QueuedSignalPayload;
  queuedAt: number;
};

interface BeaconQueueDB extends DBSchema {
  queue: {
    key: number;
    value: Omit<QueuedSignal, "id"> & { id?: number };
  };
}

const DB_NAME = "beacon-queue-v1";
const STORE = "queue";
const VERSION = 1;

// Background Sync's registration tag. Must match the `event.tag` check in
// `sw.ts`'s `sync` handler exactly — same class of coupling as
// `installPromptStash.ts`'s `window.__deferredInstallPrompt` property name.
export const SYNC_TAG = "replay-signal-queue";

// TypeScript's bundled DOM lib doesn't define Background Sync at all — no
// `SyncManager`, no `ServiceWorkerRegistration.sync` (checked directly
// against the installed typescript package, 2026-07-23; same class of gap
// as the Notification options fields found this week). `SyncManager`'s
// shape here is exactly what MDN documents (`register`/`getTags`), and the
// declaration-merge augments the real global `ServiceWorkerRegistration`
// interface rather than reaching for `any`.
interface SyncManager {
  register(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}
declare global {
  interface ServiceWorkerRegistration {
    readonly sync: SyncManager;
  }
}

let dbPromise: Promise<IDBPDatabase<BeaconQueueDB>> | null = null;

function openBeaconQueueDb(): Promise<IDBPDatabase<BeaconQueueDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BeaconQueueDB>(DB_NAME, VERSION, {
      upgrade(db) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      },
    });
  }
  return dbPromise;
}

export async function getQueuedSignals(): Promise<QueuedSignal[]> {
  try {
    const db = await openBeaconQueueDb();
    return (await db.getAll(STORE)) as QueuedSignal[];
  } catch {
    // IDB unavailable (private mode, storage corruption) — nothing to
    // replay is the correct degradation, same as a queue that was never
    // written to.
    return [];
  }
}

export async function dequeueSignal(id: number): Promise<void> {
  try {
    const db = await openBeaconQueueDb();
    await db.delete(STORE, id);
  } catch {
    // Best-effort — if the delete itself fails, the entry may be replayed
    // again later (a duplicate play count), which is a smaller risk than
    // losing it forever. The existing beacon path already accepts this
    // class of imprecision (a beacon that reaches the server but whose
    // response is lost still can't be un-sent).
  }
}

// Persists a failed beacon, then best-effort registers a Background Sync
// request so a supporting browser replays it as soon as connectivity
// returns — even if the page has since closed. Never throws: the call site
// (`sendPlay`) is fire-and-forget, matching the `sendBeacon` call it's
// replacing.
export async function queueSignalForReplay(payload: QueuedSignalPayload): Promise<void> {
  try {
    const db = await openBeaconQueueDb();
    await db.add(STORE, { payload, queuedAt: Date.now() });
  } catch {
    // IDB unavailable — the play count is lost, exactly today's behavior
    // with no queue at all. No worse off than before this feature existed.
    return;
  }

  try {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    if (!("sync" in registration)) return;
    await registration.sync.register(SYNC_TAG);
  } catch {
    // No Background Sync support (Safari, Firefox) or a permissions
    // rejection — `BeaconQueueFlusher`'s mount + `online` listener is the
    // fallback replay path for exactly this case.
  }
}

// Replays every queued signal via `fetch` — NOT `navigator.sendBeacon`,
// which is Window-only (verified against MDN, 2026-07-23: it's defined on
// `Navigator`, not `WorkerNavigator`, and is specifically built around
// page-unload semantics a service worker doesn't have). Called from
// `sw.ts`'s `sync` handler inside `event.waitUntil()`, which already keeps
// the worker alive for the duration — the same guarantee sendBeacon exists
// to give a page that might close, the SW gets for free. Exported (rather
// than living inline in `sw.ts`) so it's unit-testable — `sw.ts` itself has
// no jsdom harness (same gap documented repeatedly this week for its other
// handlers).
export async function replaySignalQueue(): Promise<void> {
  const queued = await getQueuedSignals();
  for (const { id, payload } of queued) {
    try {
      const response = await fetch("/api/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // Only dequeue on a genuine success — a rejected fetch (still
      // offline, or a transient server error) leaves the entry queued for
      // the next sync attempt (the UA retries with backoff unless
      // `event.lastChance` is true) or the page-side fallback.
      if (response.ok) await dequeueSignal(id);
    } catch {
      // Network failure mid-replay (connectivity dropped again) — same
      // "leave it queued" outcome as a non-ok response.
    }
  }
}
