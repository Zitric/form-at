import { type MusicSet, getSet, sets } from "@form-at/data/sets";
import { fetchAllSets, fetchSetForDetailPage } from "~/data/sets";

// `fetchAllSets`/`fetchSetForDetailPage` are createServerFn calls — from the
// CLIENT, that's a network request to the server. Offline, that request
// itself rejects BEFORE the server (and `getAllSetsWithFallback`/
// `getSetByIdWithFallback`'s D1-error fallback in ~/data/sets) ever runs —
// a client-side-network failure, a completely different failure point than
// the server-side D1 fallback, which only ever runs if the server was
// reachable in the first place. Without a `.catch()` at THIS layer too, an
// offline click-nav rejects the route loader outright → "Something went
// wrong" error boundary, the exact offline-survival guarantee this whole
// feature exists for — the same class of bug `~/data/set-stats.ts`'s
// `fetchOverallStats().catch(() => null)` already exists to prevent, just
// missed here on the first pass.
//
// Kept in their own module (importing fetchAllSets/fetchSetForDetailPage
// rather than living alongside them in ~/data/sets) specifically so a test
// can mock those two calls and verify this catch actually fires — a same-
// file internal call wouldn't be interceptable by `vi.mock`, since ESM live
// bindings only affect how OTHER modules see an export, not how the
// defining module calls its own top-level declarations.
//
// Route loaders call these two, not `fetchAllSets`/`fetchSetForDetailPage`
// directly, so this specific catch is real, shared code — not something a
// future edit to either route file could accidentally drop again.
export async function fetchAllSetsForRoute(): Promise<MusicSet[]> {
  return fetchAllSets().catch(() => sets);
}

export async function fetchSetForRoute(id: string): Promise<MusicSet | null> {
  return fetchSetForDetailPage({ data: id }).catch(() => getSet(id) ?? null);
}
