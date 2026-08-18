// Pre-upload client-side sanity checks — a convenience, not a guarantee (same
// trust model as send-push.ts's validate()). Access-gated and admin-only, so
// the job is catching an honest mistake (a malformed peaks.json, a non-image
// "artwork") before it breaks silently later — the waveform falling back to a
// plain scrubber, or artwork 404ing forever — not resisting a malicious
// operator.

// Shape verified against a real peaks file from R2 (PWA_PROGRESS.md's PR4 entry
// has the trace): `{ "peaks": number[] }`, exactly 1000 elements
// (scripts/generate-peaks.mjs's `const PEAKS = 1000`, not duration-dependent),
// values NOT bounded to [0, 1] — real max observed was 1.137. `[0, 2]` is
// deliberate headroom above that: catches garbage/NaN without false-rejecting
// legitimate encoding variance.
const EXPECTED_PEAKS_LENGTH = 1000;
const MAX_PEAK_VALUE = 2;

export async function validatePeaksFile(file: File): Promise<boolean> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object") return false;
  const peaks = (parsed as Record<string, unknown>).peaks;
  if (!Array.isArray(peaks) || peaks.length !== EXPECTED_PEAKS_LENGTH) return false;
  return peaks.every(
    (p) => typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= MAX_PEAK_VALUE,
  );
}

// A real image decode, not just a MIME-type check — rejects a renamed
// non-image file that a MIME sniff alone would miss.
export async function validateArtworkFile(file: File): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close();
    return true;
  } catch {
    return false;
  }
}

// The duration-metadata load (see UploadSetForm.tsx) doubles as this file's
// validity check — if the browser can't read `loadedmetadata`, it isn't
// playable audio. Exported separately so the form's duration-read effect
// and a standalone validity check share one implementation.
//
// A CSP block on the `blob:` load fires the audio element's `error` event
// exactly like a genuinely unplayable file does — the DOM gives no way to
// tell the two apart from the `error` event alone. `securitypolicyviolation`
// is the one signal specific to the CSP case, so it's used here to attach a
// distinct rejection reason. It fires synchronously when the browser blocks
// the resource load, before the media element's own `error` event is
// queued, so the flag it sets is safe to read inside that handler. A blocked
// `blob:` load reports `blockedURI` as the bare scheme ("blob"), not the
// full URL — CSP redacts blob/data/filesystem URIs.
export function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    let blockedByCsp = false;
    const onCspViolation = (e: SecurityPolicyViolationEvent) => {
      if (e.violatedDirective.startsWith("media-src")) blockedByCsp = true;
    };
    document.addEventListener("securitypolicyviolation", onCspViolation);
    const cleanup = () => {
      URL.revokeObjectURL(url);
      document.removeEventListener("securitypolicyviolation", onCspViolation);
    };
    audio.preload = "metadata";
    audio.addEventListener(
      "loadedmetadata",
      () => {
        cleanup();
        resolve(audio.duration);
      },
      { once: true },
    );
    audio.addEventListener(
      "error",
      () => {
        cleanup();
        reject(new Error(blockedByCsp ? "AUDIO_BLOCKED_BY_CSP" : "INVALID_AUDIO_FILE"));
      },
      { once: true },
    );
    audio.src = url;
  });
}
