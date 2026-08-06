// This app's own D1-fallback wrapping around @form-at/data/sets's plain
// fetchUploadedSets/mergeSets/fetchSetById. Only the app-specific wrapping lives
// here — the catalogue's canonical exports (MusicSet, sets, getSet, AUDIO_HOST)
// are imported from `@form-at/data/sets` directly, never re-exported through
// this file.
import {
  type MusicSet,
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
    const live = await fetchUploadedSets(db);
    return mergeSets(live, sets);
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
  const live = await fetchUploadedSets(db);
  return mergeSets(live, sets);
}

export const fetchAllSetsLive = createServerFn({ method: "GET" }).handler(({ context }) =>
  getAllSetsLive(getDb(context)),
);

export const fetchSetForDetailPage = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(({ data: id, context }) => getSetByIdWithFallback(getDb(context), id));

// Existence check for `routes/api/event.ts`/`routes/api/signal.ts`'s
// anti-spam validation — deliberately the OPPOSITE precedence from
// `getSetByIdWithFallback`/`mergeSets` above. Those are the READ path, where
// D1 wins because a direct-SQL edit should show up immediately.
// Validation only cares whether an id EXISTS at all, never which
// copy is "fresher" — so checking the free, always-available static
// snapshot FIRST and only touching D1 on a miss is strictly better here: it
// resolves every set that existed at the last deploy with zero D1 reads
// (the overwhelming majority of real traffic — this project's `plays`
// table sits around ~300 rows total), and only pays a D1 read for a set
// genuinely uploaded since then. Fails CLOSED on a D1 error (reject, don't
// assume valid) — matching this table's own "reject, don't sanitize"
// philosophy (trackableEvents.ts): a D1 hiccup should not become a window
// where arbitrary set_ids get accepted.
export async function isKnownSetId(db: D1Database | undefined, id: string): Promise<boolean> {
  if (getSet(id)) return true;
  if (!db) return false;
  try {
    const row = await db.prepare("SELECT 1 FROM sets WHERE id = ?").bind(id).first();
    return row !== null;
  } catch {
    return false;
  }
}
