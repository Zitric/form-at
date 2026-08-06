import { AUDIO_ORIGIN } from "@form-at/data/sets";
import { AwsClient } from "aws4fetch";

// The id becomes both an R2 object key path
// segment AND a public URL path segment (`/sets/{id}` on the site,
// `sets/{id}/...` in the bucket) — and it's client-editable (see
// slugifySetId.ts), making it the one place in this whole flow where the
// client controls something structural. Strict allowlist, no denylist: only
// lowercase ASCII letters/digits and single hyphens, bounded length. This
// rejects slashes, `..`, percent-encoded bytes, uppercase, whitespace, and
// non-ASCII/unicode-lookalike characters by construction.
const SET_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MIN_ID_LENGTH = 3;
const MAX_ID_LENGTH = 100;

// Exported for unit tests — same "export pure logic" convention used
// throughout this repo.
export function isValidSetId(id: string): boolean {
  return id.length >= MIN_ID_LENGTH && id.length <= MAX_ID_LENGTH && SET_ID_PATTERN.test(id);
}

const R2_BUCKET = "form-at-sets";

export type SetR2Keys = {
  audioKey: string;
  artworkKey: string;
  peaksKey: string;
  publicAudioUrl: string;
  publicArtworkUrl: string;
  publicPeaksUrl: string;
};

// Single source of truth for R2 key + public URL derivation, used by both
// the presign and create endpoints. Deliberately calls `isValidSetId` itself
// and throws if it fails — not just relying on the route handler's own
// `validate()` having already checked. This is the enforcement point that
// actually matters: the id-shaped danger is specifically about what becomes
// a key/URL segment, which is exactly what this function produces, so it
// fails closed even if some future call site (or a refactor) forgets to
// validate first.
export function deriveSetR2Keys(id: string, exts: { audio: string; artwork: string }): SetR2Keys {
  if (!isValidSetId(id)) throw new Error(`INVALID_SET_ID: ${id}`);
  const audioKey = `sets/${id}/audio.${exts.audio}`;
  const artworkKey = `sets/${id}/artwork.${exts.artwork}`;
  const peaksKey = `sets/${id}/peaks.json`;
  return {
    audioKey,
    artworkKey,
    peaksKey,
    publicAudioUrl: `${AUDIO_ORIGIN}/${audioKey}`,
    publicArtworkUrl: `${AUDIO_ORIGIN}/${artworkKey}`,
    publicPeaksUrl: `${AUDIO_ORIGIN}/${peaksKey}`,
  };
}

export type R2Credentials = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
};

// Generous for a slow-connection 220MB upload (see PWA_PROGRESS.md's PR4
// entry) — long enough that a presigned URL never expires mid-upload, short
// enough to bound how long a leaked URL stays useful.
const PRESIGN_EXPIRY_SECONDS = 60 * 60;

// Presigned PUT URL for direct-to-R2 upload, bypassing the Worker entirely
// for the actual bytes. `aws4fetch` is the standard Workers-compatible
// SigV4 signing library for this (confirmed via web search — no first-party
// Cloudflare binding method exists for presigning yet); same
// "small, zero-Node-dependency package for one crypto task" precedent
// `jose` already set for Access JWT verification.
//
// `signQuery: true` signs only the `Host` header by default — the client
// must PUT with no manually-set headers (see uploadWithProgress.ts) to
// avoid R2 rejecting an unsigned header the browser added.
export async function presignSetUploadUrl(key: string, creds: R2Credentials): Promise<string> {
  const client = new AwsClient({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const url = new URL(`https://${creds.accountId}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`);
  url.searchParams.set("X-Amz-Expires", String(PRESIGN_EXPIRY_SECONDS));
  const signed = await client.sign(url.toString(), {
    method: "PUT",
    aws: { signQuery: true },
  });
  return signed.url;
}
