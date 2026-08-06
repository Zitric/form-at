// The VAPID public key — safe to commit and expose to the client; only the
// PRIVATE key proves authorization to send. Deliberately a plain constant rather
// than an env var, because there's nothing here to protect. Consumed by
// `pushManager.subscribe({ applicationServerKey: ... })`.
//
// If the keys are ever rotated, this constant AND the `VAPID_PRIVATE_KEY_JWK`
// values (apps/web/.env + the Cloudflare Pages secret) must change together — a
// mismatched pair fails silently at `pushManager.subscribe()`, or with a 401/403
// at send time. See PWA_PROGRESS.md's Phase 2 section for the rotation checklist.
export const VAPID_PUBLIC_KEY =
  "BGoZDkz9X9AZ264iXoFngijx7RN1_SaPYzSrewCDNJHOHptYJ4n0hqjPy0B5Tjz2FHWRQzM0FN_o8Sn7N0f0dUE";
