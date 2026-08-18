# apps/admin

The internal dashboard — `admin.formatglasgow.com`. Analytics the collective can
actually read, plus set upload, set restore and push sending.

A **separate** Cloudflare Pages project rather than a route inside the public
site. That's what makes the security model work: Cloudflare Access gates the
subdomain at the edge, so there is no login code in this app at all. A `/admin`
route inside the public site couldn't be gated without putting Access in front of
the whole site.

```bash
pnpm dev:admin     # :5174
pnpm test:admin
pnpm -C apps/admin test:e2e
pnpm -C apps/admin diagnose-visits   # why is the visits card empty?
```

No Cloudflare credentials needed locally — with no D1 binding present the
dashboard renders fixtures from `app/data/sample-stats.ts` and shows a
`sample data` marker, so a wrong number can't be mistaken for a real one.

## Layout

| Path | |
|---|---|
| `app/routes/dashboard.tsx` | the dashboard; tab content is in `components/*Tab.tsx` |
| `app/routes/api/` | the four mutating endpoints — upload, presign, restore, send-push |
| `app/data/` | aggregate D1 queries, Cloudflare Analytics reads, the RUM archive reader |
| `app/utils/hostGuard.ts` | the `*.pages.dev` guard — see below |
| `app/utils/verifyAccessJwt.ts` | server-side Access identity verification |

## Two security controls that look redundant and are not

**`hostGuard.ts` is the only thing keeping this off the public internet.**
Cloudflare Access can gate hostnames in a zone we own; it **cannot** gate
Cloudflare's own `*.pages.dev`. The same deployment answers at
`form-at-admin.pages.dev` and at every per-deployment preview URL. `server.ts`
returns a plain 404 for any host that isn't `admin.formatglasgow.com` (localhost
exempted for dev and e2e), before routing and before any D1 access. Deleting it
makes the dashboard public.

**Every mutating endpoint calls `verifyAccessJwt`.** Access gates *page loads* at
the edge, not individual endpoint calls, so each writer verifies the Access
identity server-side. All four do. There is deliberately no dev-mode bypass, and
only the read-only aggregate queries may skip it.

## The CSP blocks the Web Analytics beacon on purpose

If the console shows `static.cloudflareinsights.com` blocked by CSP here,
that's intentional — and it isn't this app's own injection to go looking for,
because there isn't one. `apps/web/app/utils/rootHead.ts` injects the beacon
deliberately (see `@form-at/data/webAnalytics`'s header for why); `apps/admin`
never does. Cloudflare's zone-level automatic Web Analytics setup edge-injects
the same beacon into every hostname in the `formatglasgow.com` zone, admin
included, and `app/server.ts`'s `DOCUMENT_CSP` doesn't allowlist it — which is
the point: this dashboard's own visits would otherwise pollute the public
site's traffic numbers. The actual toggle for that edge injection lives in the
Cloudflare dashboard's Web Analytics settings, not in this repo.

`media-src 'self' blob:'` **is** required, though. `UploadSetForm`'s duration
read (`readAudioDuration`, `app/utils/validateUpload.ts`) loads the selected
file into an `<audio>` element via a `blob:` object URL, and without that
directive the load is silently blocked, `loadedmetadata` never fires, and
every upload reports a valid mp3 as unreadable — found against a real upload,
2026-08-18 (see `TECH_DEBT.md` item 23a).

## The house rule for numbers

A metric that failed to load is `null`, never `0`. `0` states "no traffic"; `null`
states "we couldn't read it", and rendering the first for the second is a wrong
fact rather than a missing one. The same rule is why `TrendChart` takes
`(number | null)[]` — an uncaptured day has to render as a gap, or an outage
draws as flat traffic. See `data/cf-analytics.ts` and `data/rum-history.ts` for
the per-metric reasoning.
