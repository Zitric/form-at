import { createFileRoute } from "@tanstack/react-router";
import { isKnownSetId } from "~/data/sets";

type TrackBody = {
  setId: string;
  setTitle: string;
  setArtist: string;
  listenedSeconds: number;
  // Whether the SW served these bytes from IDB (standalone + saved) vs the
  // network — see `wasServedFromIdb` in `store/playerSlice.ts` for the exact
  // signal this mirrors. `null` covers rows from before this field existed
  // AND any cached client still posting the old payload shape during a deploy
  // rollout window (the user-consented update flow means old JS can
  // legitimately keep running for a while) — optional by design, not a
  // reason to drop an otherwise-valid play record.
  isOffline: boolean | null;
  // Client-generated id shared by every segment beacon within one
  // continuous engagement with a track (see useAudioPlayer.ts's
  // sessionIdRef and schema.sql's session_id comment) — lets a read-time
  // COUNT(DISTINCT ...) collapse pause/resume segments back into one real
  // play. Same optional-by-design tri-state as isOffline: null for rows
  // predating this field, a stale rollout-window client, or anything that
  // fails validation below — never a reason to drop the row.
  sessionId: string | null;
};

// Defense in depth — the client already filters <3s and caps via Date math,
// but a bot can hit this endpoint directly with anything. Drop rows that
// would inflate stats or fill D1 with garbage.
const MIN_LISTENED = 3;
const MAX_LISTENED = 4 * 60 * 60; // 4h — longer than any set
const MAX_STR = 200;

// Exported, matching `api/event.ts`'s convention. `async` because the setId
// existence check is `isKnownSetId`, which
// only touches D1 on a snapshot miss (see the precedence comment on
// `isKnownSetId` in ~/data/sets.ts). `db` is threaded in from the handler
// rather than read here, so this stays a plain, directly-testable function.
export async function validate(
  raw: unknown,
  db: D1Database | undefined,
): Promise<TrackBody | null> {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.setId !== "string" || r.setId.length === 0 || r.setId.length > MAX_STR) return null;
  if (typeof r.setTitle !== "string" || r.setTitle.length === 0) return null;
  if (typeof r.setArtist !== "string" || r.setArtist.length === 0) return null;
  if (typeof r.listenedSeconds !== "number" || !Number.isFinite(r.listenedSeconds)) return null;
  // setId must match a known set — blocks fake-ID spam against the stats table
  if (!(await isKnownSetId(db, r.setId))) return null;
  const seconds = Math.floor(r.listenedSeconds);
  if (seconds < MIN_LISTENED || seconds > MAX_LISTENED) return null;
  const isOffline = typeof r.isOffline === "boolean" ? r.isOffline : null;
  const sessionId =
    typeof r.sessionId === "string" && r.sessionId.length > 0 && r.sessionId.length <= MAX_STR
      ? r.sessionId
      : null;
  return {
    setId: r.setId,
    setTitle: r.setTitle.slice(0, MAX_STR),
    setArtist: r.setArtist.slice(0, MAX_STR),
    listenedSeconds: seconds,
    isOffline,
    sessionId,
  };
}

export const Route = createFileRoute("/api/signal")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const cf = (context as unknown as Record<string, unknown>).cloudflare as
            | { env: { DB: D1Database } }
            | undefined;
          const db = cf?.env?.DB;

          const body = await validate(await request.json(), db);
          // Always 204 — don't leak what we accepted/rejected to potential abusers.
          if (!body) return new Response(null, { status: 204 });

          const country =
            (request as unknown as { cf?: { country?: string } }).cf?.country ?? "unknown";

          if (db) {
            await db
              .prepare(
                "INSERT INTO plays (set_id, set_title, set_artist, country, started_at, listened_seconds, is_offline, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              )
              .bind(
                body.setId,
                body.setTitle,
                body.setArtist,
                country,
                Date.now(),
                body.listenedSeconds,
                body.isOffline === null ? null : body.isOffline ? 1 : 0,
                body.sessionId,
              )
              .run();
          }
        } catch {
          // analytics must never break the app
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
