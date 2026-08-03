// Transitional re-export — the canonical source moved to packages/data/src/sets.ts
// so apps/admin can read the same catalogue without duplicating it. Kept as a
// shim here (rather than sweeping all ~33 `~/data/sets` import sites across
// apps/web to `@form-at/data/sets` directly) to keep this migration scoped to
// standing up apps/admin, not an unrelated mechanical rename. See TECH_DEBT.md
// item 21 for the proposed follow-up sweep.
export * from "@form-at/data/sets";

import {
  type MusicSet,
  fetchSetById,
  fetchUploadedSets,
  getSet,
  mergeSets,
  sets,
} from "@form-at/data/sets";
import { createServerFn } from "@tanstack/react-start";

// Wraps the shared fetchUploadedSets/mergeSets/fetchSetById (plain functions
// taking a D1Database, live in packages/data so apps/admin's upload endpoints
// can reuse them too) with this app's createServerFn + context.cloudflare
// plumbing — same "has exactly one real consumer (this app's /sets pages),
// stays local" precedent fetchOverallStats already sets in ~/data/set-stats.ts.
//
// Both fall back to the committed build-time snapshot (`sets`, imported
// above) whenever there's no D1 binding at all (local `vite dev`) OR the live
// query throws (a real D1 outage) — never a blank page, never a 500. See the
// comment above `sets` in packages/data/src/sets.ts for the full
// offline-survival reasoning this exists for.
//
// The fallback logic itself is split into plain, directly-testable functions
// (below) rather than living inline in the `createServerFn` handlers —
// `createServerFn`'s wrapping isn't something a plain unit test can invoke
// the way the fake-D1 tests elsewhere in this repo do, so the actual
// D1-error → snapshot-only behavior needs a callable outside that wrapper to
// be testable at all.

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

export const fetchSetForDetailPage = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(({ data: id, context }) => getSetByIdWithFallback(getDb(context), id));
