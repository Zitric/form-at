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

// ── Upload versions ─────────────────────────────────────────────────────────
// Every upload writes under its own folder, `sets/{id}/{version}/…`, so a
// re-upload of the same set id gets new URLs instead of overwriting the old
// objects. Every cache keyed by URL then sees the change: the CDN, browsers,
// the installed app's saved copy (whose URL guard drops a copy the catalogue
// no longer lists) and the per-set peaks / durations stamps. TECH_DEBT.md
// item 31 has the stale-copy incident this exists for.
//
// Versioned objects are immutable: never overwrite one, upload a new
// version instead. The Cloudflare cache rule for cdn.formatglasgow.com caches
// `/sets/*/*/*` for a year (README → "CDN rules for cdn.formatglasgow.com").
// The flat pre-versioning keys (`sets/{id}/audio.mp3`) stay as they are and
// keep the default caching.
//
// The version is the upload time in base36 plus 4 random base36 characters,
// generated server-side at presign: sortable, unguessable enough to never
// collide, and never hashed from content (the bytes go straight from the
// browser to R2, and hashing 220MB in the browser would need it all in
// memory). Exported, with versionedSetKey, for any other writer (the
// fine-peaks backfill) so every writer produces the same shape.
const UPLOAD_VERSION_PATTERN = /^v[0-9a-z]{8,12}-[0-9a-z]{4}$/;
// One file name inside a version folder: no slashes, no leading dot.
const VERSIONED_FILE_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

export function generateUploadVersion(
  now: number = Date.now(),
  random: () => number = Math.random,
): string {
  const suffix = Array.from({ length: 4 }, () => Math.floor(random() * 36).toString(36)).join("");
  return `v${now.toString(36)}-${suffix}`;
}

export function isValidUploadVersion(version: string): boolean {
  return UPLOAD_VERSION_PATTERN.test(version);
}

/** `sets/{id}/{version}/{file}`; throws on an invalid id, version or file name. */
export function versionedSetKey(id: string, version: string, file: string): string {
  if (!isValidSetId(id)) throw new Error(`INVALID_SET_ID: ${id}`);
  if (!isValidUploadVersion(version)) throw new Error(`INVALID_UPLOAD_VERSION: ${version}`);
  if (!VERSIONED_FILE_PATTERN.test(file)) throw new Error(`INVALID_FILE_NAME: ${file}`);
  return `sets/${id}/${version}/${file}`;
}

/** The `sets.artwork` value of an uploaded set: the base name its responsive
 *  variants are generated under (apps/web/scripts/optimize-images.ts), so a
 *  re-upload's artwork gets new image URLs too. Older rows hold
 *  `uploads/{id}`, which still works. */
export function uploadedArtworkName(id: string, version: string): string {
  if (!isValidSetId(id)) throw new Error(`INVALID_SET_ID: ${id}`);
  if (!isValidUploadVersion(version)) throw new Error(`INVALID_UPLOAD_VERSION: ${version}`);
  return `uploads/${id}-${version}`;
}

export type SetR2Keys = {
  audioKey: string;
  artworkKey: string;
  peaksKey: string;
  publicAudioUrl: string;
  publicArtworkUrl: string;
  publicPeaksUrl: string;
};

// Single source of truth for R2 key + public URL derivation, used by both
// the presign and create endpoints. Validates the id and version itself (via
// versionedSetKey) and throws — not just relying on the route handler's own
// `validate()` having already checked. This is the enforcement point that
// actually matters: the danger is specifically about what becomes a key/URL
// segment, which is exactly what this function produces, so it fails closed
// even if some future call site (or a refactor) forgets to validate first.
export function deriveSetR2Keys(
  id: string,
  version: string,
  exts: { audio: string; artwork: string },
): SetR2Keys {
  const audioKey = versionedSetKey(id, version, `audio.${exts.audio}`);
  const artworkKey = versionedSetKey(id, version, `artwork.${exts.artwork}`);
  const peaksKey = versionedSetKey(id, version, "peaks.json");
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
