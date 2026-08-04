import { createFileRoute } from "@tanstack/react-router";
import { type SetR2Keys, deriveSetR2Keys } from "~/utils/r2Sets";
import { extractAccessToken, verifyAccessJwt } from "~/utils/verifyAccessJwt";

// Set-upload feature (PR4). Access-gated (same pattern as send-push.ts).
// Creates the `sets` row after all 3 R2 uploads have already succeeded
// client-side (see UploadSetForm.tsx) — this endpoint never sees file
// bytes, only re-derives the same public URLs the presign step already
// handed out via `deriveSetR2Keys` (never trusts a client-supplied URL
// string for anything structural). Re-VERIFIES that claim server-side too
// (see `verifyR2ObjectsExist` below) rather than taking the client's word
// for it — a row pointing at a 404 lands on the public site, not just the
// admin's own screen.
//
// The `sets.id` PRIMARY KEY constraint at the INSERT below is the actual
// race-proof guarantee — not the presign step's earlier uniqueness check.
// Two admins racing the same id: the second one's presign check might pass
// if it runs before the first's create, but the second INSERT here fails on
// the constraint and that admin gets a 409 instead — no duplicate row, ever.

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

function isUniqueConstraintError(e: unknown): boolean {
  return e instanceof Error && e.message.includes("UNIQUE constraint failed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Nothing before this point actually checks that the 3 R2 uploads
// succeeded — this endpoint takes the client's word for it. Access-gated,
// so the threat model is an honest mistake (a bug in the form's error
// handling, a retry racing a failure, a direct call skipping the uploads
// entirely), not an attacker — but the consequence lands on the PUBLIC
// site: a row whose src/artwork/peaks point at 404s. A HEAD against each
// public URL closes that for the cost of 3 cheap requests on an operation
// that already took minutes. Plain `fetch` against the public CDN URLs
// (not a signed R2 API call) — this runs server-side in the Worker, so the
// browser-side HEAD-against-R2 CORS quirk (TECH_DEBT.md item 15) doesn't
// apply, and R2 has strong read-after-write consistency (confirmed against
// Cloudflare's own docs) so there's no eventual-consistency flakiness to
// retry around here. Deliberately no retry on a genuine 404/error — by the
// time this runs, the client has already reported all 3 PUTs succeeded, so
// a HEAD failure here means something real; the admin's own resubmit (which
// restarts the whole presign→PUTs→create sequence) is the retry path.
// Exported for unit tests — mocked-fetch coverage of the "some object is
// missing" and "R2 request throws" paths, independent of the route
// handler's Access/validate/insert wrapping.
export async function verifyR2ObjectsExist(keys: SetR2Keys): Promise<boolean> {
  const urls = [keys.publicAudioUrl, keys.publicArtworkUrl, keys.publicPeaksUrl];
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

// Exported for unit tests — the retry-then-fail path (transient D1 error
// retried with backoff; a UNIQUE-constraint error is the real thing, not a
// blip, and is never retried) is exactly the behavior PR4's review asked to
// be tested directly, independent of the route handler's Access/validate
// wrapping.
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
          // apps/web/scripts/optimize-images.ts (PR5) generates this set's
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
    },
  },
});
