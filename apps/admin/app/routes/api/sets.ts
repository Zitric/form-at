import { createFileRoute } from "@tanstack/react-router";
import { type SetR2Keys, deriveSetR2Keys } from "~/utils/r2Sets";
import { extractAccessToken, verifyAccessJwt } from "~/utils/verifyAccessJwt";

// Access-gated. Creates the `sets` row after all 3 R2 uploads have already
// succeeded client-side (see UploadSetForm.tsx): this endpoint never sees file
// bytes, and re-derives the public URLs via `deriveSetR2Keys` rather than
// trusting a client-supplied URL string for anything structural.
//
// The `sets.id` PRIMARY KEY constraint at the INSERT below is the actual
// race-proof guarantee, NOT the presign step's earlier uniqueness check: two
// admins racing the same id can both pass presign, but the second INSERT fails
// on the constraint and that admin gets a 409 — no duplicate row, ever.

const AUDIO_EXTS = ["mp3"] as const;
const ARTWORK_EXTS = ["jpg", "jpeg", "png"] as const;
const MAX_TITLE_LEN = 200;
const MAX_ARTIST_LEN = 200;
const MAX_VENUE_LEN = 200;
const MAX_DESCRIPTION_LEN = 2000;
const MAX_DURATION_LEN = 20;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type CreateSetBody = {
  id: string;
  title: string;
  artist: string;
  date: string;
  venue?: string;
  description?: string;
  duration?: string;
  sizeBytes?: number;
  audioExt: (typeof AUDIO_EXTS)[number];
  artworkExt: (typeof ARTWORK_EXTS)[number];
};

// Exported for unit tests — same convention as send-push.ts's validate().
// `id` validity is enforced again inside `deriveSetR2Keys` regardless (see
// r2Sets.ts) — not duplicated here beyond a bare non-empty-string check,
// since the real enforcement point is the function that turns it into a
// key/URL segment.
export function validate(raw: unknown): CreateSetBody | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.id !== "string" || r.id.length === 0) return null;
  if (typeof r.title !== "string" || r.title.length === 0 || r.title.length > MAX_TITLE_LEN) {
    return null;
  }
  if (typeof r.artist !== "string" || r.artist.length === 0 || r.artist.length > MAX_ARTIST_LEN) {
    return null;
  }
  if (typeof r.date !== "string" || !DATE_PATTERN.test(r.date)) return null;
  if (r.venue !== undefined && (typeof r.venue !== "string" || r.venue.length > MAX_VENUE_LEN)) {
    return null;
  }
  if (
    r.description !== undefined &&
    (typeof r.description !== "string" || r.description.length > MAX_DESCRIPTION_LEN)
  ) {
    return null;
  }
  if (
    r.duration !== undefined &&
    (typeof r.duration !== "string" || r.duration.length > MAX_DURATION_LEN)
  ) {
    return null;
  }
  if (
    r.sizeBytes !== undefined &&
    (typeof r.sizeBytes !== "number" || !Number.isFinite(r.sizeBytes) || r.sizeBytes <= 0)
  ) {
    return null;
  }
  if (typeof r.audioExt !== "string" || !(AUDIO_EXTS as readonly string[]).includes(r.audioExt)) {
    return null;
  }
  if (
    typeof r.artworkExt !== "string" ||
    !(ARTWORK_EXTS as readonly string[]).includes(r.artworkExt)
  ) {
    return null;
  }

  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    date: r.date,
    venue: r.venue as string | undefined,
    description: r.description as string | undefined,
    duration: r.duration as string | undefined,
    sizeBytes: r.sizeBytes as number | undefined,
    audioExt: r.audioExt as (typeof AUDIO_EXTS)[number],
    artworkExt: r.artworkExt as (typeof ARTWORK_EXTS)[number],
  };
}

// Exported so routes/api/sets/restore.ts can classify the same D1 error
// shape on its own INSERT (the "id was reused since delete" case) — this
// exact string check is the load-bearing part, not worth a second copy that
// could silently drift out of sync with what D1 actually throws.
//
// A substring match, deliberately not anchored to the `D1_ERROR:` prefix or
// the `SQLITE_CONSTRAINT` suffix — don't tighten it. It has to hold for an
// INSERT inside a db.batch() (restoreSetFromLog) as well as a standalone
// .run() (insertSetWithRetry): batch() surfaces the constraint error with an
// identical `.message` and position in the batch array makes no difference, so
// both call sites classify id-reuse as a 409 rather than a 500.
export function isUniqueConstraintError(e: unknown): boolean {
  return e instanceof Error && e.message.includes("UNIQUE constraint failed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Nothing before this point checks that the 3 R2 uploads actually succeeded —
// the client's word for it isn't enough, because the consequence lands on the
// PUBLIC site: a row whose src/artwork/peaks point at 404s. Three cheap HEADs
// close that on an operation that already took minutes.
//
// Plain `fetch` against the public CDN URLs, not a signed R2 API call: this
// runs server-side in the Worker, so the browser-side HEAD-against-R2 quirk
// (TECH_DEBT.md item 15) doesn't apply, and R2's strong read-after-write
// consistency means there's no eventual-consistency flakiness to retry around.
// Deliberately no retry on a genuine 404 — the client has already reported all
// 3 PUTs as succeeded, so a failure here is real; the admin's own resubmit
// (which restarts presign→PUTs→create) is the retry path.
//
// Takes a plain URL list rather than a `SetR2Keys` object so restore.ts can
// check however many URLs a given log row actually recorded — legacy sets have
// no `artwork_original_url`. Callers decide which URLs are real BEFORE calling;
// this only ever sees URLs that should exist. Exported for unit tests.
export async function verifyUrlsExist(urls: string[]): Promise<boolean> {
  const checks = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { method: "HEAD" });
        return res.ok;
      } catch {
        return false;
      }
    }),
  );
  return checks.every(Boolean);
}

export async function verifyR2ObjectsExist(keys: SetR2Keys): Promise<boolean> {
  return verifyUrlsExist([keys.publicAudioUrl, keys.publicArtworkUrl, keys.publicPeaksUrl]);
}

// Exported for unit tests — covers the retry-then-fail path directly,
// independent of the route handler's Access/validate wrapping: a transient D1
// error is retried with backoff, while a UNIQUE-constraint error is the real
// thing rather than a blip and is never retried.
export async function insertSetWithRetry(
  db: D1Database,
  row: {
    id: string;
    title: string;
    artist: string;
    date: string;
    venue: string | null;
    description: string | null;
    duration: string | null;
    src: string;
    artwork: string;
    artworkOriginalUrl: string;
    peaks: string;
    sizeBytes: number | null;
    createdAt: number;
  },
): Promise<"created" | "conflict" | "failed"> {
  const delaysMs = [200, 500];
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      await db
        .prepare(
          "INSERT INTO sets (id, title, artist, date, venue, description, duration, src, artwork, artwork_original_url, peaks, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          row.id,
          row.title,
          row.artist,
          row.date,
          row.venue,
          row.description,
          row.duration,
          row.src,
          row.artwork,
          row.artworkOriginalUrl,
          row.peaks,
          row.sizeBytes,
          row.createdAt,
        )
        .run();
      return "created";
    } catch (e) {
      if (isUniqueConstraintError(e)) return "conflict";
      if (attempt === delaysMs.length) return "failed";
      await sleep(delaysMs[attempt] ?? 500);
    }
  }
  return "failed";
}

// Edit and delete.

type EditSetBody = {
  id: string;
  title: string;
  artist: string;
  date: string;
  venue?: string;
  description?: string;
  duration?: string;
};

// Exported for unit tests — same convention as `validate` above. Notably
// does NOT reject a mismatched/malicious `id` the way `validate` rejects a
// bad `audioExt`, because there's nothing to reject: `id` is used exactly
// once, in `updateSet`'s `WHERE` clause — see that function's comment for
// why this is enforced structurally rather than by validation.
export function validateEdit(raw: unknown): EditSetBody | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.id !== "string" || r.id.length === 0) return null;
  if (typeof r.title !== "string" || r.title.length === 0 || r.title.length > MAX_TITLE_LEN) {
    return null;
  }
  if (typeof r.artist !== "string" || r.artist.length === 0 || r.artist.length > MAX_ARTIST_LEN) {
    return null;
  }
  if (typeof r.date !== "string" || !DATE_PATTERN.test(r.date)) return null;
  if (r.venue !== undefined && (typeof r.venue !== "string" || r.venue.length > MAX_VENUE_LEN)) {
    return null;
  }
  if (
    r.description !== undefined &&
    (typeof r.description !== "string" || r.description.length > MAX_DESCRIPTION_LEN)
  ) {
    return null;
  }
  if (
    r.duration !== undefined &&
    (typeof r.duration !== "string" || r.duration.length > MAX_DURATION_LEN)
  ) {
    return null;
  }

  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    date: r.date,
    venue: r.venue as string | undefined,
    description: r.description as string | undefined,
    duration: r.duration as string | undefined,
  };
}

// The id is never something this function CAN change, by construction rather
// than by validation: `id` appears exactly once, in the final `WHERE`, and the
// `SET` clause's bind params are strictly
// title/artist/date/venue/description/duration. Keep it that way — the id is
// the R2 key path, the public URL, AND the analytics join key across
// `plays`/`events`, so changing it would orphan all three.
//
// Exported for unit tests — asserts `result.meta.changes` (D1's affected-row
// count) distinguishes a genuine update from "no row had this id".
export async function updateSet(
  db: D1Database,
  body: EditSetBody,
): Promise<"updated" | "not_found"> {
  const result = await db
    .prepare(
      "UPDATE sets SET title = ?, artist = ?, date = ?, venue = ?, description = ?, duration = ? WHERE id = ?",
    )
    .bind(
      body.title,
      body.artist,
      body.date,
      body.venue ?? null,
      body.description ?? null,
      body.duration ?? null,
      body.id,
    )
    .run();
  return result.meta.changes > 0 ? "updated" : "not_found";
}

type DeletedSetRow = {
  id: string;
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

// Delete is NOT soft-delete — the row is genuinely gone. R2 objects are
// deliberately left in place (manual cleanup), and `plays`/`events` rows are
// untouched: admin-stats.ts's fetchClickStats already handles an unresolvable
// set_id gracefully, and fetchPlayStats denormalizes title/artist so it never
// looks at the catalogue at all.
//
// The audit INSERT and the sets DELETE go out as a single db.batch(), never two
// separate .run()s — batch() is a real transaction, so an un-migrated
// admin_deleted_sets table fails the DELETE too by construction rather than by
// luck of ordering. Keep the array order (INSERT, then DELETE) anyway: if D1's
// atomicity guarantee were ever weaker than documented, "log, then delete"
// still fails in the safe direction.
//
// The play-count read is metadata about the deletion, not a precondition for
// it, so it's wrapped separately and defaults to 0 rather than propagating —
// a failure there must not block the delete.
//
// Exported for unit tests.
export async function deleteSetWithAudit(
  db: D1Database,
  id: string,
  deletedByEmail: string,
): Promise<"deleted" | "not_found"> {
  const row = await db.prepare("SELECT * FROM sets WHERE id = ?").bind(id).first<DeletedSetRow>();
  if (!row) return "not_found";

  let playCount = 0;
  try {
    const playCountRow = await db
      .prepare("SELECT COUNT(*) AS n FROM plays WHERE set_id = ?")
      .bind(id)
      .first<{ n: number }>();
    playCount = playCountRow?.n ?? 0;
  } catch {
    playCount = 0;
  }

  const insertAudit = db
    .prepare(
      `INSERT INTO admin_deleted_sets
        (deleted_at, deleted_by_email, set_id, title, artist, date, venue, description, duration, src, artwork, artwork_original_url, peaks, size_bytes, created_at, play_count_at_deletion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      Date.now(),
      deletedByEmail,
      row.id,
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
      row.created_at,
      playCount,
    );
  const deleteRow = db.prepare("DELETE FROM sets WHERE id = ?").bind(id);

  await db.batch([insertAudit, deleteRow]);

  return "deleted";
}

export const Route = createFileRoute("/api/sets")({
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

        let body: CreateSetBody | null;
        try {
          body = validate(await request.json());
        } catch {
          body = null;
        }
        if (!body) return new Response(null, { status: 400 });

        const db = env?.DB;
        if (!db) return new Response(null, { status: 503 });

        let keys: SetR2Keys;
        try {
          keys = deriveSetR2Keys(body.id, { audio: body.audioExt, artwork: body.artworkExt });
        } catch {
          return new Response(null, { status: 400 });
        }

        if (!(await verifyR2ObjectsExist(keys))) {
          return new Response(null, { status: 422 });
        }

        const outcome = await insertSetWithRetry(db, {
          id: body.id,
          title: body.title,
          artist: body.artist,
          date: body.date,
          venue: body.venue ?? null,
          description: body.description ?? null,
          duration: body.duration ?? null,
          src: keys.publicAudioUrl,
          // `uploads/{id}`, NOT `sets/{id}` — deliberately a different local
          // /images/ directory than the 4 legacy sets' committed variants.
          // apps/web/scripts/optimize-images.ts generates this set's
          // responsive variants there, and only there, specifically so a
          // path-based .gitignore can tell an uploaded set's generated
          // files apart from a legacy set's committed ones in the same
          // `sets/` folder — see that script's UPLOADED_OUT comment.
          artwork: `uploads/${body.id}`,
          artworkOriginalUrl: keys.publicArtworkUrl,
          peaks: keys.publicPeaksUrl,
          sizeBytes: body.sizeBytes ?? null,
          createdAt: Date.now(),
        });

        if (outcome === "conflict") return new Response(null, { status: 409 });
        if (outcome === "failed") return new Response(null, { status: 500 });
        return Response.json({ id: body.id }, { status: 201 });
      },
      PATCH: async ({ request, context }) => {
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

        let body: EditSetBody | null;
        try {
          body = validateEdit(await request.json());
        } catch {
          body = null;
        }
        if (!body) return new Response(null, { status: 400 });

        const db = env?.DB;
        if (!db) return new Response(null, { status: 503 });

        const outcome = await updateSet(db, body);
        if (outcome === "not_found") return new Response(null, { status: 404 });
        return Response.json({ id: body.id }, { status: 200 });
      },
      DELETE: async ({ request, context }) => {
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

        let id: string | null;
        try {
          const parsed = (await request.json()) as Record<string, unknown>;
          id = typeof parsed.id === "string" && parsed.id.length > 0 ? parsed.id : null;
        } catch {
          id = null;
        }
        if (!id) return new Response(null, { status: 400 });

        const db = env?.DB;
        if (!db) return new Response(null, { status: 503 });

        const outcome = await deleteSetWithAudit(db, id, identity.email);
        if (outcome === "not_found") return new Response(null, { status: 404 });
        return new Response(null, { status: 200 });
      },
    },
  },
});
