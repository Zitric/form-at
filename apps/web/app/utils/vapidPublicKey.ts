// The VAPID public key — safe to expose to the client (that's the whole
// point of VAPID's asymmetric design: the public key identifies the
// application server to the push service, the PRIVATE key is what proves
// authorization to send, and only the private key needs to stay secret).
// Consumed by `pushManager.subscribe({ applicationServerKey: ... })`.
//
// Generated once via `npx @pushforge/builder vapid` (2026-07-15) — see
// PWA_PROGRESS.md's Phase 2 section for the full key-generation record and
// the matching private-key storage instructions. This file is the ONLY
// place the public key needs to live; it's a plain committed constant, not
// an env var, because there's no sensitivity to protect here.
//
// If these keys are ever rotated, this constant AND the
// `VAPID_PRIVATE_KEY_JWK` values (apps/web/.env + the Cloudflare Pages
// secret) must change together — a mismatched pair fails silently
// at `pushManager.subscribe()` (browser rejects with a DOMException) or at
// send time (push service returns 401/403). See the Phase 2 doc section for
// the rotation checklist.
export const VAPID_PUBLIC_KEY =
  "BPtDmnCE0CgPP4l2CDmeiHFn_fkrFhWMStLpszfB1Bh1ZgAV_pTtgiduClX-MRfs94XrUoXPv_I9bDTGURq_pLw";
