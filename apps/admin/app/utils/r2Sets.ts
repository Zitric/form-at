import { FINE_PEAKS_FILE, versionedSetKey } from "@form-at/data/r2Keys";
import { AUDIO_ORIGIN } from "@form-at/data/sets";
import { AwsClient } from "aws4fetch";

// Set ids, upload versions and the `sets/{id}/{version}/{file}` key shape live
// in @form-at/data/r2Keys, shared with the scripts that write to R2. This
// file adds what only the admin needs: the four keys of an upload, and
// presigning.

const R2_BUCKET = "form-at-sets";

export type SetR2Keys = {
  audioKey: string;
  artworkKey: string;
  peaksKey: string;
  finePeaksKey: string;
  publicAudioUrl: string;
  publicArtworkUrl: string;
  publicPeaksUrl: string;
  publicFinePeaksUrl: string;
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
  const finePeaksKey = versionedSetKey(id, version, FINE_PEAKS_FILE);
  return {
    audioKey,
    artworkKey,
    peaksKey,
    finePeaksKey,
    publicAudioUrl: `${AUDIO_ORIGIN}/${audioKey}`,
    publicArtworkUrl: `${AUDIO_ORIGIN}/${artworkKey}`,
    publicPeaksUrl: `${AUDIO_ORIGIN}/${peaksKey}`,
    publicFinePeaksUrl: `${AUDIO_ORIGIN}/${finePeaksKey}`,
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
