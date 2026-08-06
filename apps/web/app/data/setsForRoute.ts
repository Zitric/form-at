import { type MusicSet, getSet, sets } from "@form-at/data/sets";
import { fetchAllSets, fetchSetForDetailPage } from "~/data/sets";

// `fetchAllSets`/`fetchSetForDetailPage` are createServerFn calls, so from the
// CLIENT they're network requests. Offline, the request rejects BEFORE the
// server's own D1-error fallback in ~/data/sets can run — a different failure
// point entirely, since that fallback only runs if the server was reachable.
// So this layer needs its own `.catch()`: without it an offline click-nav
// rejects the route loader and throws up the "Something went wrong" boundary,
// destroying exactly the offline survival this feature exists for.
//
// Route loaders must call THESE, not the underlying two directly — that's what
// makes the catch shared code a future route edit can't quietly drop.
//
// Kept in their own module so a test can mock the two calls and verify the
// catch fires: a same-file internal call isn't interceptable by `vi.mock`,
// because ESM live bindings only affect how OTHER modules see an export.
export async function fetchAllSetsForRoute(): Promise<MusicSet[]> {
  return fetchAllSets().catch(() => sets);
}

export async function fetchSetForRoute(id: string): Promise<MusicSet | null> {
  return fetchSetForDetailPage({ data: id }).catch(() => getSet(id) ?? null);
}
