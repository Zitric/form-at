import { createFileRoute } from "@tanstack/react-router";
import { getSet } from "~/data/sets";
import { type TrackableEventType, isTrackableEventType } from "~/utils/trackableEvents";

// Wire shape is snake_case (event_type / set_id / is_standalone) rather
// than this codebase's usual camelCase JSON body — deliberate, matching the
// design decided this week. `api/signal.ts`'s camelCase body is untouched;
// the two endpoints intentionally don't share a casing convention.
type EventBody = {
  eventType: TrackableEventType;
  setId: string | null;
  isStandalone: boolean;
};

const MAX_STR = 200;

// Exported for unit tests — same "export pure logic" convention as
// `canFetchPlaybackBytes` / `classifyDownloadFailure` elsewhere in this repo.
// `api/signal.ts`'s own `validate` predates that convention and isn't
// exported; not fixing that pre-existing gap here, out of scope.
export function validate(raw: unknown): EventBody | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // Reject anything not on the allowlist — this is the guard against the
  // table quietly becoming a dumping ground for arbitrary strings.
  if (typeof r.event_type !== "string" || !isTrackableEventType(r.event_type)) return null;
  if (typeof r.is_standalone !== "boolean") return null;

  // set_id is optional — only save_click/share_click carry one today, but
  // validation doesn't hard-couple which event_types are allowed to send
  // it; any event_type MAY include a set_id, and if it does, it must
  // resolve to a real set (same anti-spam rule as `api/signal.ts`).
  let setId: string | null = null;
  if (r.set_id !== undefined && r.set_id !== null) {
    if (typeof r.set_id !== "string" || r.set_id.length === 0 || r.set_id.length > MAX_STR) {
      return null;
    }
    if (!getSet(r.set_id)) return null;
    setId = r.set_id;
  }

  return { eventType: r.event_type, setId, isStandalone: r.is_standalone };
}

export const Route = createFileRoute("/api/event")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const body = validate(await request.json());
          // Always 204 — don't leak what we accepted/rejected to potential abusers.
          if (!body) return new Response(null, { status: 204 });

          const cf = (context as unknown as Record<string, unknown>).cloudflare as
            | { env: { DB: D1Database } }
            | undefined;
          const db = cf?.env?.DB;

          if (db) {
            await db
              .prepare(
                "INSERT INTO events (event_type, set_id, is_standalone, created_at) VALUES (?, ?, ?, ?)",
              )
              .bind(body.eventType, body.setId, body.isStandalone ? 1 : 0, Date.now())
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
