// This app's own D1-fallback wrapping around @form-at/data/sets's plain
// fetchUploadedSets/mergeSets/fetchSetById. Only the app-specific wrapping lives
// here — the catalogue's canonical exports (MusicSet, sets, getSet, AUDIO_HOST)
// are imported from `@form-at/data/sets` directly, never re-exported through
// this file.
import {
  type MusicSet,
  fetchDeletedSetIds,
  fetchSetById,
  fetchUploadedSets,
  getSet,
  mergeSets,
  sets,
} from "@form-at/data/sets";
import { createServerFn } from "@tanstack/react-start";

// Wraps the shared fetchUploadedSets/mergeSets/fetchSetById from packages/data
// with this app's createServerFn + context.cloudflare plumbing — kept local
// because this app's /sets pages are the only consumer, the same precedent
// fetchOverallStats sets in ~/data/set-stats.ts.
//
// Both fall back to the committed build-time snapshot whenever there's no D1
// binding (local `vite dev`) OR the live query throws (a real D1 outage) —
// never a blank page, never a 500.
//
// Keep the fallback logic in plain functions below rather than inlining it into
// the `createServerFn` handlers: a unit test can't invoke `createServerFn`'s
// wrapping the way the fake-D1 tests here do, so the D1-error → snapshot
// behaviour needs a callable outside that wrapper to be testable at all.

function getDb(context: unknown): D1Database | undefined {
  const cf = (context as Record<string, unknown>).cloudflare as
    | { env: { DB: D1Database } }
    | undefined;
  return cf?.env?.DB;
}

export async function getAllSetsWithFallback(db: D1Database | undefined): Promise<MusicSet[]> {
  if (!db) return sets;
  try {
    // Parallel, not sequential — fetchDeletedSetIds never throws (see its own
    // comment), so the only way this whole try block still fails is the live
    // fetch itself throwing, unchanged from before this existed.
    const [live, deletedIds] = await Promise.all([fetchUploadedSets(db), fetchDeletedSetIds(db)]);
    return mergeSets(live, sets, deletedIds);
  } catch {
    return sets;
  }
}

export async function getSetByIdWithFallback(
  db: D1Database | undefined,
  id: string,
): Promise<MusicSet | null> {
  if (!db) return getSet(id) ?? null;
  try {
    return (await fetchSetById(db, id)) ?? null;
  } catch {
    return getSet(id) ?? null;
  }
}

export const fetchAllSets = createServerFn({ method: "GET" }).handler(({ context }) =>
  getAllSetsWithFallback(getDb(context)),
);

// Boot-confirmation path for CatalogueSync.tsx — deliberately NOT
// `getAllSetsWithFallback`. That function
// resolves successfully with the bare snapshot both when there's no D1
// binding and when the live query throws, which makes a genuine merged
// result indistinguishable from a substituted fallback to anything awaiting
// its promise. CatalogueSync needs exactly that distinction: it only marks
// the catalogue `catalogueConfirmed` (see catalogueSlice.ts) when a live D1
// read actually succeeded — never when any fallback was substituted
// anywhere in the chain, including server-side ones the client never sees
// as a network failure. So this rejects (never swallows) on both "no D1
// binding" and "the live query threw," giving the caller a real promise
// rejection to `.catch()` on instead of a falsely-successful snapshot.
export async function getAllSetsLive(db: D1Database | undefined): Promise<MusicSet[]> {
  if (!db) throw new Error("NO_D1_BINDING");
  // fetchDeletedSetIds never throws, so this still rejects on exactly the
  // same condition as before (the live fetch itself throwing) — no new way
  // for this function to silently resolve with a degraded result.
  const [live, deletedIds] = await Promise.all([fetchUploadedSets(db), fetchDeletedSetIds(db)]);
  return mergeSets(live, sets, deletedIds);
}

export const fetchAllSetsLive = createServerFn({ method: "GET" }).handler(({ context }) =>
  getAllSetsLive(getDb(context)),
);

export const fetchSetForDetailPage = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(({ data: id, context }) => getSetByIdWithFallback(getDb(context), id));

// Existence + duration lookup backing `isKnownSetId` below and
// `routes/api/signal.ts`'s per-track listened-seconds ceiling — one pass
// resolves both "does this id exist" and "how long is it", so a request
// needing both doesn't pay for two separate lookups.
//
// Deliberately the OPPOSITE precedence from `getSetByIdWithFallback`/
// `mergeSets` above. Those are the READ path, where D1 wins because a
// direct-SQL edit should show up immediately. This only cares whether an id
// EXISTS (and, secondarily, its duration), never which copy is "fresher" —
// so checking the free, always-available static snapshot FIRST and only
// touching D1 on a miss is strictly better here: it resolves every set that
// existed at the last deploy without the existence-query D1 read (the
// overwhelming majority of real traffic — this project's `plays` table
// sits around ~300 rows total), and only pays that read for a set genuinely
// uploaded since then.
//
// The snapshot itself is NOT tombstone-aware, though — it's a build-time
// copy that a delete doesn't regenerate, so a deleted set's entry keeps
// reading as "known" from the snapshot alone until the next deploy. That's
// exactly what let a deleted set (`set-003-til`) keep collecting plays six
// days after deletion. So the tombstone check (`fetchDeletedSetIds`, the
// same one `mergeSets` uses) always runs whenever a D1 binding exists,
// regardless of snapshot hit or miss — one extra, cheap D1 read
// (`admin_deleted_sets` is tiny) per call. It never throws itself (see its
// own comment), so a tombstone-read failure falls through to this
// function's pre-tombstone-check behaviour (snapshot/D1 existence only)
// rather than rejecting every id while it's down.
//
// Fails CLOSED on the existence query itself, unchanged from before
// (reject, don't assume valid) — matching this table's own "reject, don't
// sanitize" philosophy (trackableEvents.ts): a D1 hiccup should not become a
// window where arbitrary set_ids get accepted.
export async function resolveKnownSet(
  db: D1Database | undefined,
  id: string,
): Promise<{ duration?: string } | null> {
  const snapshotSet = getSet(id);
  if (!db) return snapshotSet ? { duration: snapshotSet.duration } : null;
  const deletedIds = await fetchDeletedSetIds(db);
  if (deletedIds.has(id)) return null;
  if (snapshotSet) return { duration: snapshotSet.duration };
  try {
    const row = await db
      .prepare("SELECT duration FROM sets WHERE id = ?")
      .bind(id)
      .first<{ duration: string | null }>();
    return row ? { duration: row.duration ?? undefined } : null;
  } catch {
    return null;
  }
}

export async function isKnownSetId(db: D1Database | undefined, id: string): Promise<boolean> {
  return (await resolveKnownSet(db, id)) !== null;
}
