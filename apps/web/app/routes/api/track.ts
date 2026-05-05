import { createFileRoute } from "@tanstack/react-router";

type TrackBody = {
  setId: string;
  setTitle: string;
  setArtist: string;
  listenedSeconds: number;
};

export const Route = createFileRoute("/api/track")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const body = (await request.json()) as TrackBody;
          const cf = (context as unknown as Record<string, unknown>).cloudflare as
            | { env: { DB: D1Database } }
            | undefined;
          const db = cf?.env?.DB;
          const country =
            (request as unknown as { cf?: { country?: string } }).cf?.country ?? "unknown";

          if (db) {
            await db
              .prepare(
                "INSERT INTO plays (set_id, set_title, set_artist, country, started_at, listened_seconds) VALUES (?, ?, ?, ?, ?, ?)",
              )
              .bind(
                body.setId,
                body.setTitle,
                body.setArtist,
                country,
                Date.now(),
                body.listenedSeconds,
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
