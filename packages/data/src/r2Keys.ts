// R2 key building for set files, shared by every writer: the admin upload
// (apps/admin/app/utils/r2Sets.ts) and scripts that add files to a set, such
// as the fine-peaks backfill (apps/web/scripts/backfill-fine-peaks.ts). One
// module, so every writer produces the same shape. Pure: no Node or Worker
// APIs.

// The id becomes both an R2 object key path
// segment AND a public URL path segment (`/sets/{id}` on the site,
// `sets/{id}/...` in the bucket) — and it's client-editable (see the admin's
// slugifySetId.ts), making it the one place in the upload flow where the
// client controls something structural. Strict allowlist, no denylist: only
// lowercase ASCII letters/digits and single hyphens, bounded length. This
// rejects slashes, `..`, percent-encoded bytes, uppercase, whitespace, and
// non-ASCII/unicode-lookalike characters by construction.
const SET_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MIN_ID_LENGTH = 3;
const MAX_ID_LENGTH = 100;

export function isValidSetId(id: string): boolean {
  return id.length >= MIN_ID_LENGTH && id.length <= MAX_ID_LENGTH && SET_ID_PATTERN.test(id);
}

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
// The version is the upload time in base36 plus 4 random base36 characters:
// sortable, unguessable enough to never collide, and never hashed from
// content (an upload's bytes go straight from the browser to R2, and hashing
// 220MB in the browser would need it all in memory).
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

/** The fine-resolution peaks file inside a version folder (finePeaks.ts). */
export const FINE_PEAKS_FILE = "peaks-fine.bin";
