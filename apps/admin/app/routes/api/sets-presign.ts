import { createFileRoute } from "@tanstack/react-router";
import {
  type R2Credentials,
  type SetR2Keys,
  deriveSetR2Keys,
  isValidSetId,
  presignSetUploadUrl,
} from "~/utils/r2Sets";
import { extractAccessToken, verifyAccessJwt } from "~/utils/verifyAccessJwt";

// Set-upload feature (PR4). Access-gated (same 3-line pattern as
// send-push.ts, reused directly — no new gating mechanism). Presigns 3
// direct-to-R2 PUT URLs after checking id uniqueness — the actual
// race-proof guarantee is the `sets.id` PRIMARY KEY constraint at the
// create step's INSERT, not this check; this is a UX-friendly early signal
// so an admin gets a fast 409 before doing any uploading, not the whole
// safety story.

const AUDIO_EXTS = ["mp3"] as const;
const ARTWORK_EXTS = ["jpg", "jpeg", "png"] as const;

type PresignBody = {
  id: string;
  audioExt: (typeof AUDIO_EXTS)[number];
  artworkExt: (typeof ARTWORK_EXTS)[number];
};

// Exported for unit tests — same "export pure logic" convention as
// send-push.ts's validate().
export function validate(raw: unknown): PresignBody | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.id !== "string" || !isValidSetId(r.id)) return null;
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
    audioExt: r.audioExt as (typeof AUDIO_EXTS)[number],
    artworkExt: r.artworkExt as (typeof ARTWORK_EXTS)[number],
  };
}

type PresignResponseBody = {
  audioUploadUrl: string;
  artworkUploadUrl: string;
  peaksUploadUrl: string;
  publicAudioUrl: string;
  publicArtworkUrl: string;
  publicPeaksUrl: string;
};

// Exported for unit tests — `createFileRoute`'s wrapping isn't unit-testable
// (same documented limitation as every other API route in this repo), so
// the id-uniqueness check + presign logic lives in a plain, directly-
// testable function instead of inline in the handler. Proves the id-already-
// exists → conflict path never reaches `presignSetUploadUrl` (real R2
// signing) at all, by construction (early return before that line) —
// verifiable with a fake D1 whose `.prepare` spy shows exactly one call.
export async function presignSetUpload(
  db: D1Database,
  creds: R2Credentials,
  body: PresignBody,
): Promise<
  | { outcome: "conflict" }
  | { outcome: "invalid" }
  | { outcome: "ok"; response: PresignResponseBody }
> {
  const existing = await db.prepare("SELECT 1 FROM sets WHERE id = ?").bind(body.id).first();
  if (existing) return { outcome: "conflict" };

  let keys: SetR2Keys;
  try {
    keys = deriveSetR2Keys(body.id, { audio: body.audioExt, artwork: body.artworkExt });
  } catch {
    return { outcome: "invalid" };
  }

  const [audioUploadUrl, artworkUploadUrl, peaksUploadUrl] = await Promise.all([
    presignSetUploadUrl(keys.audioKey, creds),
    presignSetUploadUrl(keys.artworkKey, creds),
    presignSetUploadUrl(keys.peaksKey, creds),
  ]);

  return {
    outcome: "ok",
    response: {
      audioUploadUrl,
      artworkUploadUrl,
      peaksUploadUrl,
      publicAudioUrl: keys.publicAudioUrl,
      publicArtworkUrl: keys.publicArtworkUrl,
      publicPeaksUrl: keys.publicPeaksUrl,
    },
  };
}

export const Route = createFileRoute("/api/sets-presign")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const cf = (context as unknown as Record<string, unknown>).cloudflare as
          | {
              env: {
                DB: D1Database;
                CF_ACCESS_TEAM_DOMAIN?: string;
                CF_ACCESS_AUD?: string;
                R2_ACCOUNT_ID?: string;
                R2_ACCESS_KEY_ID?: string;
                R2_SECRET_ACCESS_KEY?: string;
              };
            }
          | undefined;
        const env = cf?.env;

        // Verify the Access identity FIRST — before touching D1 or R2.
        const teamDomain = env?.CF_ACCESS_TEAM_DOMAIN;
        const aud = env?.CF_ACCESS_AUD;
        if (!teamDomain || !aud) return new Response(null, { status: 401 });
        const token = extractAccessToken(request);
        if (!token) return new Response(null, { status: 401 });
        const identity = await verifyAccessJwt(token, { teamDomain, aud });
        if (!identity) return new Response(null, { status: 401 });

        let body: PresignBody | null;
        try {
          body = validate(await request.json());
        } catch {
          body = null;
        }
        if (!body) return new Response(null, { status: 400 });

        const db = env?.DB;
        const accountId = env?.R2_ACCOUNT_ID;
        const accessKeyId = env?.R2_ACCESS_KEY_ID;
        const secretAccessKey = env?.R2_SECRET_ACCESS_KEY;
        if (!db || !accountId || !accessKeyId || !secretAccessKey) {
          return new Response(null, { status: 503 });
        }

        const result = await presignSetUpload(
          db,
          { accountId, accessKeyId, secretAccessKey },
          body,
        );
        if (result.outcome === "conflict") return new Response(null, { status: 409 });
        if (result.outcome === "invalid") return new Response(null, { status: 400 });
        return Response.json(result.response);
      },
    },
  },
});
