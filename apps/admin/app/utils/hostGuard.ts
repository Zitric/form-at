// Cloudflare Access is configured at the subdomain level, gating
// admin.formatglasgow.com — but Access self-hosted applications can only
// cover hostnames in zones we own. It CANNOT gate Cloudflare's own
// *.pages.dev domain, so the same deployment is also reachable,
// unauthenticated, at form-at-admin.pages.dev and every per-deployment
// preview URL (e.g. cd9a05fe.form-at-admin.pages.dev). This guard is the
// only thing standing between the dashboard and the public internet on
// those hosts — without it the dashboard is public. Do not remove this as
// "redundant" with Access.
export const ALLOWED_HOST = "admin.formatglasgow.com";

// localhost/127.0.0.1 (any port) bypass the guard — covers `vite dev`,
// `vite preview`, the Playwright e2e suite, and manual `wrangler pages dev`
// testing, none of which are reachable from the public internet.
export function isAllowedHost(hostname: string): boolean {
  return hostname === ALLOWED_HOST || hostname === "localhost" || hostname === "127.0.0.1";
}
