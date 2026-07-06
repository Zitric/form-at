// THE canonical audio host (TECH_DEBT 19 — custom domain in front of the
// form-at-sets R2 bucket; no rate limit, Cloudflare edge caching, the
// production-recommended path).
//
// Worker-safe module (zero imports, no window/navigator): `sw.ts` imports
// the hostname for its audio route matcher and type-checks under WebWorker
// libs. Every code reference to the audio host goes through these consts —
// the ONE place that changes if the host ever moves again. Exceptions that
// can't import TS: `public/_headers` (static file — carries a keep-in-sync
// comment pointing here).

export const AUDIO_HOST = "cdn.formatglasgow.com";
export const AUDIO_ORIGIN = `https://${AUDIO_HOST}`;
