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
//
// THE TRAP THIS VALUE IS SPECIFICALLY FOR: a Cloudflare account can hold
// MULTIPLE Web Analytics "sites" — one per hostname AND per setup method, not
// one per zone. This account has (at least) two: formatglasgow.com and
// form-at-web.pages.dev, each with its own independent token, each looking
// exactly as valid as the other. The value here was once copied from a
// snippet during the manual-injection switch above without confirming which
// site it actually belonged to — it was the pages.dev site's token, not the
// real domain's. The failure that produces is silent, not loud: the beacon
// fires correctly from formatglasgow.com with a token that's genuinely
// registered to something, and Cloudflare's own origin check rejects the
// report with a bare 404 — indistinguishable in the browser console from a
// wholly bogus token, invisible to the CSP (the request is allowed, it just
// fails at the destination), and invisible to the archiver (a read against
// the wrong site's data is a real, successful read of a genuinely-empty
// site — see TECH_DEBT.md's entry on the month this went unnoticed). Before
// ever replacing this value again: confirm the snippet's own site name in
// the Cloudflare dashboard matches the domain this actually deploys to.
// Matching the shape of a token proves nothing about matching the site.
export const WEB_ANALYTICS_SITE_TAG = "116ff31b655c48fb98bbeb34f7e65fdf";

/**
 * False while the constant is still the placeholder. `rootHead.ts` uses this to
 * skip the beacon entirely rather than shipping one with a bogus token — a
 * forgotten placeholder then degrades to "no analytics", which is visible, and
 * not "analytics silently posting to nowhere", which isn't.
 */
export function hasWebAnalyticsSiteTag(): boolean {
  return !WEB_ANALYTICS_SITE_TAG.startsWith("REPLACE_WITH_");
}
