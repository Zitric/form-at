# rum-archiver

A cron Worker that copies Cloudflare Web Analytics (RUM) daily rows into D1
before Cloudflare degrades them. Deployed as `form-at-rum-archiver`.

**Why it exists:** Cloudflare keeps beacon data exact for **7 days**, then
aggregates it to roughly 10%. That's a property of the data's *age*, not of how
wide a query is — so a live read of last month is an extrapolation with whole
days missing, and no query can recover the original. Copying each day out while
it's still exact is the only way to keep an accurate long-run record.

Its output is read by the admin dashboard's `visits_history` card
(`apps/admin/app/data/rum-history.ts`). Nothing else consumes it.

## Why a standalone Worker and not part of `apps/admin`

**Cloudflare Pages Functions cannot run cron.** They expose only HTTP handlers
(`onRequest*`) — there is no scheduled handler — so the capture could not live
in `apps/admin` however it was written.

A scheduled GitHub Actions workflow was the alternative and was rejected:
**Actions disables a scheduled workflow after 60 days without a commit**, and
only a commit resets that clock. On a project heading toward low activity that
stops the archive quietly and permanently about two months after the last push —
precisely the failure this is meant to survive. Cloudflare's scheduler has no
notion of repository activity.

Full reasoning, including what the archive is for: `PWA_PROGRESS.md` →
*Archiving Cloudflare RUM into D1 before it degrades*.

## What a run does

`captureWindow()` fetches the trailing `RUM_UNSAMPLED_DAYS` (7), upserts one row
per `(day, is_bot)` into `rum_daily`, and logs the run itself into
`rum_capture_runs`. Four behaviours are deliberate:

**Every run re-fetches the whole window**, not just yesterday. A missed run
therefore costs nothing as long as another lands within the week — the trigger
doesn't have to be perfectly reliable. It does *not* rescue a trigger that stops
permanently, which is why the trigger choice above still mattered.

**A failed read writes no data at all.** `fetchRumGroups` returns `null` for any
failure — bad credentials, permission, timeout, or a GraphQL `errors` array
inside a 200 — and the run stores no rows. A partial write would be
indistinguishable from a quiet day afterwards, and gaps here are invisible in
hindsight.

**Every run is logged, including the ones that store nothing.** This is not
bookkeeping for its own sake: a window with no traffic writes no rows, so
`rum_daily` keeps no trace that the run happened, and a reader deriving coverage
from it cannot tell a genuinely quiet week from a week nobody captured — it draws
seven healthy days as gaps. `rum_capture_runs` records `since`/`until` (per run,
so changing `RUM_UNSAMPLED_DAYS` can't rewrite history) and `ok`. Only `ok = 1`
runs count as coverage; `ok = 0` runs aren't coverage but prove the trigger
fired, which is what lets the dashboard distinguish a dead cron from a live cron
whose reads are all failing. **Don't stop logging failures, and don't merge the
two states at read time** — they need different fixes.

**Re-writing a day can only improve it.** `RUM_UPSERT_SQL` carries
`WHERE excluded.sample_interval <= rum_daily.sample_interval`, so an equal-quality
refresh and a degraded→exact upgrade both apply, while a late run seeing a
*degraded* copy of a day an earlier run captured exactly is rejected. Without
that guard the archive would slowly overwrite its own good data with Cloudflare's
aggregated version. **Never remove it** — it fails silently and only in hindsight.

The query, the upsert SQL and the row mapping live in
`packages/data/src/rumArchive.ts`, shared with `apps/admin` so the dashboard and
the archiver cannot drift apart in what they count.

## Setup

Julian provisions all of this; it's recorded here so the pieces are known, not so
a session runs them.

**1. A dedicated API token.** My Profile → API Tokens → Create Custom Token, with
exactly **one** permission row: Account → **Account Analytics** → Read, scoped to
this account.

This is deliberately **not** the admin dashboard's token. That one also carries
Zone → Analytics → Read for `edge_traffic`, which the archiver never needs. Two
narrow tokens rotate independently; two copies of one must roll together. Note
there is **no D1 permission** — writes go through the `DB` binding, not the REST
API.

**2. First deploy creates the Worker:**

```bash
pnpm -C apps/rum-archiver deploy      # needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
```

After that, `deploy.yml`'s `deploy-rum-archiver` job keeps it updated on pushes to
`main`. That job needs the CI token to cover **Account → Workers Scripts → Edit**
and **Account → D1 → Edit**; a token scoped narrowly to `form-at-web` will 403.

**3. Secrets on the Worker:**

```bash
cd apps/rum-archiver
npx wrangler secret put CF_ANALYTICS_TOKEN       # the narrow token from step 1
npx wrangler secret put ARCHIVE_TRIGGER_SECRET   # any long random string
```

**4. Confirm the cron registered** — Workers & Pages → form-at-rum-archiver →
Settings → Triggers should list `17 3 * * *` (daily, 03:17 UTC). `wrangler deploy`
sets this from `wrangler.toml`; it needs no dashboard step.

**5. The D1 binding** is declared in `wrangler.toml` and applied by `wrangler
deploy` — unlike Pages, no dashboard step either.

The `rum_daily` and `rum_capture_runs` tables must already exist. Both are
defined in `apps/web/schema.sql`, along with the one-time backfill that seeds
`rum_capture_runs` from the runs already evidenced by `rum_daily`. Apply them one
statement at a time with `--command`, never `--file` against the existing
database.

## Commands

| Command | |
|---|---|
| `pnpm -C apps/rum-archiver test` | unit tests (Vitest, fake D1 + fetch) |
| `pnpm -C apps/rum-archiver tsc` | typecheck |
| `pnpm -C apps/rum-archiver deploy` | `wrangler deploy` |
| `pnpm -C apps/rum-archiver capture` | `wrangler dev --test-scheduled` — fires the cron path locally |

## Running it by hand

The `fetch` handler exists so a first run can be watched rather than deployed and
hoped for. It's guarded by `ARCHIVE_TRIGGER_SECRET` and **disabled entirely**
(404) when that secret isn't set, rather than left open — an unguarded route here
would let anyone force repeated Cloudflare API reads. It only ever writes the
same rows the cron would, so the worst a leaked secret buys is redundant work.

```bash
curl -s -H "x-archive-trigger: $ARCHIVE_TRIGGER_SECRET" \
  https://form-at-rum-archiver.<subdomain>.workers.dev
```

```json
{ "ok": true, "since": "2026-08-05", "until": "2026-08-11",
  "rowsFetched": 4, "rowsWritten": 4, "rowsSkipped": 0 }
```

Cron runs log the same object — `[rum-archive] {...}` — visible via `npx wrangler
tail`. Worth knowing: the archive can't show you a run that wrote nothing,
because a gap in it looks exactly like a quiet week. The log is the only place a
failed run is visible.

Check what actually landed:

```bash
npx wrangler d1 execute form-at-analytics --remote \
  --command "SELECT day, is_bot, visits, page_loads, sample_interval FROM rum_daily ORDER BY day DESC LIMIT 14"
```

And whether the runs themselves are healthy — the two signals the dashboard
splits apart:

```bash
npx wrangler d1 execute form-at-analytics --remote \
  --command "SELECT MAX(captured_at) AS last_run, MAX(CASE WHEN ok = 1 THEN captured_at END) AS last_success FROM rum_capture_runs"
```

`last_run` far behind means the cron stopped; `last_run` current with
`last_success` far behind means it's firing and every read is failing — check the
token, not the trigger.

## Verification history

The first live capture was cross-checked against
`apps/admin/scripts/diagnose-visits.mjs`, which queries Cloudflare over an
independently written path. Both agreed to the unit: 11 visits, 23 page loads, 4
days carrying rows, 3 human rows and a single bot row. Two separately authored
query-and-aggregation paths landing on the same numbers is meaningfully stronger
evidence than one path agreeing with itself, and it's what the GraphQL query, the
bot split and the day bucketing rest on.

The upsert guard was verified separately against in-memory SQLite rather than
reasoned about: an exact row survives a later degraded capture, an equal-quality
refresh applies, and a degraded row is upgraded by an exact one.
