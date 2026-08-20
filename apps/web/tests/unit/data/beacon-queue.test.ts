import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Locks TECH_DEBT 4's actual queue mechanics against a REAL (fake, but
// spec-accurate) IndexedDB round-trip — not a mocked `idb.openDB`, per this
// item's own verification note ("seed a queue offline... confirm the queue
// is then empty"). `fake-indexeddb/auto` polyfills the global `indexedDB`
// before `~/data/beacon-queue` ever calls `openDB`.
//
// Each test re-imports the module fresh (`vi.resetModules()` + dynamic
// import) so the module's own `dbPromise` singleton doesn't carry a stale
// connection across tests. Cleanup drains the store via the module's OWN
// dequeue function rather than `indexedDB.deleteDatabase` — deleting the
// whole database blocks forever waiting for every open connection to
// close first (fires `onblocked`, never `onsuccess`/`onerror`), and
// nothing in `beacon-queue.ts` ever closes its cached connection. Found
// this the hard way: every test after the first timed out at 5000ms.

type BeaconQueueModule = typeof import("~/data/beacon-queue");

async function freshModule(): Promise<BeaconQueueModule> {
  vi.resetModules();
  return await import("~/data/beacon-queue");
}

const payload = {
  setId: "set-002-til",
  setTitle: "Form:at 002",
  setArtist: "t.i.l.",
  listenedSeconds: 45,
  isOffline: true,
  sessionId: "test-session-id",
};

afterEach(async () => {
  const { getQueuedSignals, dequeueSignal } = await import("~/data/beacon-queue");
  const leftover = await getQueuedSignals();
  await Promise.all(leftover.map((entry) => dequeueSignal(entry.id)));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("beacon-queue — enqueue / read / dequeue round-trip", () => {
  it("a queued signal is readable via getQueuedSignals", async () => {
    const { queueSignalForReplay, getQueuedSignals } = await freshModule();
    await queueSignalForReplay(payload);

    const queued = await getQueuedSignals();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.payload).toEqual(payload);
    expect(typeof queued[0]?.id).toBe("number");
  });

  it("dequeueSignal removes the entry — the queue empties (this item's own verification wording)", async () => {
    const { queueSignalForReplay, getQueuedSignals, dequeueSignal } = await freshModule();
    await queueSignalForReplay(payload);
    const [queued] = await getQueuedSignals();
    if (!queued) throw new Error("expected one queued entry");

    await dequeueSignal(queued.id);

    expect(await getQueuedSignals()).toHaveLength(0);
  });

  it("multiple queued signals all survive and can be dequeued independently", async () => {
    const { queueSignalForReplay, getQueuedSignals, dequeueSignal } = await freshModule();
    await queueSignalForReplay(payload);
    await queueSignalForReplay({ ...payload, setId: "set-002-hubey", listenedSeconds: 90 });

    const queued = await getQueuedSignals();
    expect(queued).toHaveLength(2);

    const first = queued[0];
    if (!first) throw new Error("expected an entry");
    await dequeueSignal(first.id);

    const remaining = await getQueuedSignals();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.payload.setId).not.toBe(first.payload.setId);
  });

  it("getQueuedSignals returns an empty array when nothing is queued", async () => {
    const { getQueuedSignals } = await freshModule();
    expect(await getQueuedSignals()).toEqual([]);
  });
});

describe("beacon-queue — Background Sync registration (best-effort, never throws)", () => {
  beforeEach(() => {
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("skips registration silently when the Service Worker API is absent (no crash)", async () => {
    const { queueSignalForReplay, getQueuedSignals } = await freshModule();
    await expect(queueSignalForReplay(payload)).resolves.toBeUndefined();
    // The IDB write still happened even though sync registration was skipped.
    expect(await getQueuedSignals()).toHaveLength(1);
  });

  it("skips registration silently when the registration has no sync support (Safari/Firefox shape)", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({}) }, // no `sync` property — matches unsupported browsers
    });
    const { queueSignalForReplay, getQueuedSignals } = await freshModule();
    await expect(queueSignalForReplay(payload)).resolves.toBeUndefined();
    expect(await getQueuedSignals()).toHaveLength(1);
  });

  it("registers the sync tag when the browser supports Background Sync", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({ sync: { register } }) },
    });
    const { queueSignalForReplay, SYNC_TAG } = await freshModule();
    await queueSignalForReplay(payload);
    expect(register).toHaveBeenCalledWith(SYNC_TAG);
  });
});

// `replaySignalQueue` is the actual logic behind `sw.ts`'s `sync` handler —
// exported specifically so it's testable, since `sw.ts` itself has no
// jsdom harness (workbox-precaching, `self.__WB_MANIFEST`, same gap
// documented for every other SW handler this week). Uses `fetch`, not
// `sendBeacon` (verified unavailable in a service worker's scope).
describe("beacon-queue — replaySignalQueue (the sw.ts sync handler's actual logic)", () => {
  it("fetches each queued signal and dequeues it on a successful (ok) response", async () => {
    const { queueSignalForReplay, replaySignalQueue, getQueuedSignals } = await freshModule();
    await queueSignalForReplay(payload);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);

    await replaySignalQueue();

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/signal",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    expect(await getQueuedSignals()).toHaveLength(0);
  });

  it("leaves the entry queued when the response is not ok", async () => {
    const { queueSignalForReplay, replaySignalQueue, getQueuedSignals } = await freshModule();
    await queueSignalForReplay(payload);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await replaySignalQueue();

    expect(await getQueuedSignals()).toHaveLength(1);
  });

  it("leaves the entry queued when fetch itself rejects (network failure mid-replay)", async () => {
    const { queueSignalForReplay, replaySignalQueue, getQueuedSignals } = await freshModule();
    await queueSignalForReplay(payload);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(replaySignalQueue()).resolves.toBeUndefined();
    expect(await getQueuedSignals()).toHaveLength(1);
  });

  it("replays multiple queued entries independently — one failing doesn't block another's dequeue", async () => {
    const { queueSignalForReplay, replaySignalQueue, getQueuedSignals } = await freshModule();
    await queueSignalForReplay(payload);
    await queueSignalForReplay({ ...payload, setId: "set-002-hubey" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        return { ok: body.setId === "set-002-hubey" };
      }),
    );

    await replaySignalQueue();

    const remaining = await getQueuedSignals();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.payload.setId).toBe("set-002-til");
  });

  it("does nothing when the queue is empty", async () => {
    const { replaySignalQueue } = await freshModule();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await replaySignalQueue();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
