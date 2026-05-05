import { createAPIFileRoute } from "@tanstack/react-start/api";
import { getEvent } from "vinxi/http";

type TrackBody = {
  setId: string;
  setTitle: string;
  setArtist: string;
  listenedSeconds: number;
};

export const Route = createAPIFileRoute("/api/track")({
  POST: async ({ request }) => {
    const body = (await request.json()) as TrackBody;

    try {
      const event = getEvent();
      const cf = (event.context as Record<string, unknown>).cloudflare as
        | { env: { DB: D1Database }; cf: { country?: string } }
        | undefined;

      const db = cf?.env?.DB;
      const country = cf?.cf?.country ?? "unknown";

      if (db) {
        await db
          .prepare(
            "INSERT INTO plays (set_id, set_title, set_artist, country, started_at, listened_seconds) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind(body.setId, body.setTitle, body.setArtist, country, Date.now(), body.listenedSeconds)
          .run();
      }
    } catch {
      // analytics must never break the app
    }

    return new Response(null, { status: 204 });
  },
});
