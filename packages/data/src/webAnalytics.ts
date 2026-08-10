// Cloudflare Web Analytics site tag, shared by both apps so there's one copy of
// it rather than two that drift.
//
// PUBLIC, by construction: `apps/web` renders it into every page inside the
// beacon's `data-cf-beacon` attribute, so it's visible in view-source on the
// live site. That's why it's a committed constant and not a secret or an env
// var — an identifier that ships in the HTML gains nothing from indirection.
// `apps/admin` reads the same constant to query the RUM dataset.
//
// WHY THE BEACON IS INJECTED BY US, not by Cloudflare's automatic setup:
// Cloudflare can inject it at the edge by rewriting HTML, and for a while it
// did. Then it silently stopped, with no deploy on our side that explains it —
// the beacon was verifiably present on 2026-08-06 (a CSP error in the console
// proved the browser tried to load it) and verifiably absent afterwards, on
// both the custom domain and the `pages.dev` URL. A dependency that can switch
// itself off is a bad foundation for the dashboard that reads its data, and
// Cloudflare's own docs note manual setup is the more precise option anyway:
// automatic injects across every page of the zone, manual only where the
// snippet renders. See `apps/web/app/utils/rootHead.ts` for the injection.
export const WEB_ANALYTICS_SITE_TAG = "d2a9ea502ebf4cc281ca1775dac32502";

/**
 * False while the constant is still the placeholder. `rootHead.ts` uses this to
 * skip the beacon entirely rather than shipping one with a bogus token — a
 * forgotten placeholder then degrades to "no analytics", which is visible, and
 * not "analytics silently posting to nowhere", which isn't.
 */
export function hasWebAnalyticsSiteTag(): boolean {
  return !WEB_ANALYTICS_SITE_TAG.startsWith("REPLACE_WITH_");
}
