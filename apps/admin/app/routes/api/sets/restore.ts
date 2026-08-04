import { createFileRoute } from "@tanstack/react-router";
import { isUniqueConstraintError, verifyUrlsExist } from "~/routes/api/sets";
import { extractAccessToken, verifyAccessJwt } from "~/utils/verifyAccessJwt";

// One-click restore feature (2026-08). Restore-from-log, NOT soft delete:
// `admin_deleted_sets` already stores every column needed to reconstruct a
// `sets` row (PR6), and R2 objects are deliberately never deleted — so a
// restore is just "read the log row, INSERT it back into `sets`, mark the
// log entry restored." Nothing about `mergeSets`/`fetchUploadedSets`/
// `fetchSetById`/the snapshot generator changes; the public site already
// reads `sets` live on every request (see getAllSetsWithFallback in
// apps/web), so a restored row is visible immediately — the SAME
// immediacy that makes this consequential enough to confirm plainly in the
// UI (see SetsList.tsx's RestoreConfirmModal), not just access-gate it.
//
// Nested under `routes/api/sets/` (not a 4th handler on the flat
// `routes/api/sets.ts`) because it's a genuinely different path,
// `/api/sets/restore` — verified live (temporary stub + curl) that this
// coexists with the flat `/api/sets` route with no collision before any
// real logic was written here, same rigor PR6 item 6a used for multi-method
// dispatch on a single route file.

type DeletedSetLogRow = {
  id: number;
  set_id: string;
  title: string;
  artist: string;
  date: string;
  venue: string | null;
  description: string | null;
  duration: string | null;
  src: string;
  artwork: string | null;
  artwork_original_url: string | null;
  peaks: string | null;
  size_bytes: number | null;
  created_at: number;
};

type RestoreOutcome = "restored" | "not_found" | "r2_missing" | "id_taken";

// Exported for unit tests — same convention as deleteSetWithAudit/updateSet
// in routes/api/sets.ts.
export async function restoreSetFromLog(db: D1Database, logId: number): Promise<RestoreOutcome> {
  const row = await db
    .prepare("SELECT * FROM admin_deleted_sets WHERE id = ? AND restored_at IS NULL")
    .bind(logId)
    .first<DeletedSetLogRow>();
  if (!row) return "not_found";

  // Only check URLs this row is actually recorded as having had — a NULL
  // column here is a structural fact copied verbatim from the live `sets`
  // row at delete time (deleteSetWithAudit, PR6), not a runtime guess, so it
  // faithfully distinguishes "this row never had one" (legacy sets' null
  // artwork_original_url — skip, nothing to check) from "had one, now
  // gone" (a checked URL that 404s/throws below — a genuine r2_missing).
  // `src` is NOT NULL in the schema and always checked.
  const urlsToCheck = [row.src];
  if (row.artwork_original_url !== null) urlsToCheck.push(row.artwork_original_url);
  if (row.peaks !== null) urlsToCheck.push(row.peaks);

  if (!(await verifyUrlsExist(urlsToCheck))) return "r2_missing";

  const insertSet = db
    .prepare(
      "INSERT INTO sets (id, title, artist, date, venue, description, duration, src, artwork, artwork_original_url, peaks, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      row.set_id,
      row.title,
      row.artist,
      row.date,
      row.venue,
      row.description,
      row.duration,
      row.src,
      row.artwork,
      row.artwork_original_url,
      row.peaks,
      row.size_bytes,
      // The log's ORIGINAL created_at, not Date.now() — a restore undoes a
      // mistake, it isn't a new upload, so the set goes back to its
      // original position in the catalogue's newest-first ordering rather
      // than jumping to the top as if just uploaded.
      row.created_at,
    );
  const markRestored = db
    .prepare("UPDATE admin_deleted_sets SET restored_at = ? WHERE id = ?")
    .bind(Date.now(), row.id);

  try {
    // Same atomicity reasoning as deleteSetWithAudit's db.batch(): if
    // markRestored failed independently after a successful insertSet, the
    // log would wrongly keep showing "not yet restored," and a second
    // attempt would just 409 against the row that now already exists.
    // Batching means a failure here leaves BOTH uncommitted — a clean
    // retry, no orphaned state either direction.
    await db.batch([insertSet, markRestored]);
  } catch (e) {
    if (isUniqueConstraintError(e)) return "id_taken";
    throw e;
  }

  return "restored";
}

export const Route = createFileRoute("/api/sets/restore")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const cf = (context as unknown as Record<string, unknown>).cloudflare as
          | {
              env: {
                DB: D1Database;
                CF_ACCESS_TEAM_DOMAIN?: string;
                CF_ACCESS_AUD?: string;
              };
            }
          | undefined;
        const env = cf?.env;

        const teamDomain = env?.CF_ACCESS_TEAM_DOMAIN;
        const aud = env?.CF_ACCESS_AUD;
        if (!teamDomain || !aud) return new Response(null, { status: 401 });
        const token = extractAccessToken(request);
        if (!token) return new Response(null, { status: 401 });
        const identity = await verifyAccessJwt(token, { teamDomain, aud });
        if (!identity) return new Response(null, { status: 401 });

        let logId: number | null;
        try {
          const parsed = (await request.json()) as Record<string, unknown>;
          logId = typeof parsed.id === "number" && Number.isFinite(parsed.id) ? parsed.id : null;
        } catch {
          logId = null;
        }
        if (logId === null) return new Response(null, { status: 400 });

        const db = env?.DB;
        if (!db) return new Response(null, { status: 503 });

        const outcome = await restoreSetFromLog(db, logId);
        switch (outcome) {
          case "not_found":
            return Response.json(
              {
                error: "not_found",
                message: "This deletion record no longer exists or was already restored.",
              },
              { status: 404 },
            );
          case "r2_missing":
            return Response.json(
              {
                error: "r2_missing",
                message:
                  "The original audio/artwork/peaks files are no longer in storage — this set can't be restored.",
              },
              { status: 422 },
            );
          case "id_taken":
            return Response.json(
              {
                error: "id_taken",
                message:
                  "A set with this id already exists — restore is blocked to avoid overwriting it.",
              },
              { status: 409 },
            );
          case "restored":
            return Response.json({ restored: true }, { status: 200 });
        }
      },
    },
  },
});
