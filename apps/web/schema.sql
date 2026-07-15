CREATE TABLE IF NOT EXISTS plays (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id          TEXT    NOT NULL,
  set_title       TEXT    NOT NULL,
  set_artist      TEXT    NOT NULL,
  country         TEXT    NOT NULL DEFAULT 'unknown',
  started_at      INTEGER NOT NULL,  -- unix ms
  listened_seconds INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plays_set_id    ON plays (set_id);
CREATE INDEX IF NOT EXISTS idx_plays_started_at ON plays (started_at);

-- 2026-07-08: was the play served from IDB (standalone app, set saved
-- offline) or streamed from the network? Populated from the exact same
-- signal the SW audio route uses to decide IDB-vs-network (see
-- `wasServedFromIdb` in `app/store/playerSlice.ts` + the routing comment in
-- `app/sw.ts`) — a saved set in the standalone app is served from IDB
-- regardless of connectivity, so this is "served from cache", not literally
-- "device was offline"; named `is_offline` to match the product framing.
-- NULL for existing rows and for any pre-2026-07-08 cached client still
-- posting the old payload shape during a deploy rollout window (nullable by
-- design — no backfill attempted).
--
-- ⚠️ ONE-TIME MANUAL MIGRATION — NOT idempotent, unlike every other
-- statement in this file. Originally written as `ADD COLUMN IF NOT EXISTS`
-- on the (incorrect, 2026-07-15-disproven) assumption that D1 supports that
-- clause the way vanilla SQLite ≥3.35 does — it doesn't: running the
-- IF-NOT-EXISTS form against remote D1 fails with
-- `near "EXISTS": syntax error at offset 923: SQLITE_ERROR` every time,
-- confirmed via `wrangler d1 execute --remote --file=schema.sql`. The bare
-- form below is Cloudflare's documented-safe D1 pattern and was verified
-- working via `wrangler d1 execute --remote --command`
-- (`PRAGMA table_info(plays)` confirmed `is_offline` present afterward) —
-- but running it AGAIN on a database that already has the column will fail
-- with a duplicate-column error, since there's no IF-NOT-EXISTS guard
-- anymore. Already applied to production as of 2026-07-15; do not re-run
-- this line via `--file` against that database. A fresh/dev database still
-- needs it run once.
ALTER TABLE plays ADD COLUMN is_offline INTEGER;

-- Aggregate/anonymous first-party event tracking (Phase "Analytics 1",
-- 2026-07-08). Cloudflare Web Analytics stays as-is for page-view metrics;
-- this table is for discrete product events (install funnel, save/share
-- clicks, app launches) that CF Analytics has no concept of.
--
-- STRUCTURAL CONSTRAINT — read before adding a column: no persistent
-- device/session/user identifier of ANY kind. Each row must remain a
-- standalone fact with no reliable way to link it to another row from the
-- same visitor. Concretely:
--   - `id` is a DB-internal autoincrement PK (row order, not identity) and
--     is never returned to any client.
--   - `event_type` / `set_id` / `is_standalone` / `created_at` are all
--     low-cardinality or high-collision dimensions shared across many
--     visitors — none of them, alone or combined, reconstructs a single
--     visitor's session across two rows.
--   - No IP, no User-Agent string, no cookie ID, no fingerprint hash, no
--     `country` (unlike `plays` — deliberately omitted here; adding it
--     needs its own decision, not a silent copy from the plays table).
-- The real enforcement of this decision is at the endpoint
-- (`app/routes/api/event.ts` rejects anything not on the explicit
-- `event_type` allowlist) and in `PWA_PROGRESS.md`'s tracking-design
-- section — this comment exists so a future schema change can't drift past
-- it without the person making the change seeing why the table looks like
-- this. See PWA_PROGRESS.md for the full rationale.
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type    TEXT    NOT NULL,
  set_id        TEXT,
  is_standalone INTEGER NOT NULL,
  created_at    INTEGER NOT NULL  -- unix ms
);

-- Composite (not two single-column indexes like `plays` uses) because the
-- primary query shape is "this event_type, this date range" together — the
-- leftmost column (event_type) also serves "all events of this type"
-- queries alone via the standard leftmost-prefix rule, so a separate
-- single-column event_type index would be redundant.
CREATE INDEX IF NOT EXISTS idx_events_type_created_at ON events (event_type, created_at);
-- Separate single-column index for "everything in a date range regardless
-- of type" queries (mirrors `idx_plays_started_at`'s role for `plays`).
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at);
-- No `set_id` index: only 2 of the 6 current event_types carry one, and
-- there's no known query needing "all save_clicks for set X" yet. Add one
-- if/when that report becomes real — premature otherwise.

-- Useful queries:
--
-- Play counts per set:
--   SELECT set_title, set_artist, COUNT(*) AS plays, ROUND(AVG(listened_seconds)) AS avg_secs
--   FROM plays GROUP BY set_id ORDER BY plays DESC;
--
-- Listeners by country:
--   SELECT country, COUNT(*) AS plays FROM plays GROUP BY country ORDER BY plays DESC;
--
-- Plays by day:
--   SELECT DATE(started_at / 1000, 'unixepoch') AS day, COUNT(*) AS plays
--   FROM plays GROUP BY day ORDER BY day DESC;
--
-- Offline vs network plays (NULL = pre-is_offline rows, exclude from the ratio):
--   SELECT is_offline, COUNT(*) AS plays FROM plays
--   WHERE is_offline IS NOT NULL GROUP BY is_offline;
--
-- Install funnel (shown → accepted / dismissed), last 30 days:
--   SELECT event_type, COUNT(*) AS n FROM events
--   WHERE event_type IN ('install_prompt_shown', 'install_accepted', 'install_dismissed')
--     AND created_at > (unixepoch('now') * 1000 - 30 * 86400000)
--   GROUP BY event_type;
--
-- App launches (standalone) by day:
--   SELECT DATE(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS launches
--   FROM events WHERE event_type = 'app_launch' GROUP BY day ORDER BY day DESC;
--
-- Save-clicks per set:
--   SELECT set_id, COUNT(*) AS clicks FROM events
--   WHERE event_type = 'save_click' GROUP BY set_id ORDER BY clicks DESC;

-- Push notification subscriptions (Phase 2, 2026-07-15).
--
-- ⚠️ DELIBERATE EXCEPTION to the "no persistent identifier" rule that
-- governs `events` (see that table's comment block above). Read this before
-- assuming the same anonymous-aggregate philosophy applies here — it does
-- NOT, and that's by necessity, not an oversight or a quiet reversal of the
-- Analytics 1 decision:
--   - `events` rows are disconnected FACTS about aggregate behavior — no
--     row needs to be addressable, and addressability was explicitly
--     designed out.
--   - A push subscription's `endpoint` IS, unavoidably, an addressable
--     per-device token — that's the ENTIRE mechanism by which push
--     delivery works. The push service (FCM, Mozilla autopush, etc.) uses
--     that exact URL to route a message to one specific browser
--     installation. There is no way to implement Web Push without storing
--     something that identifies an individual subscriber's endpoint; the
--     capability and the "traceable to a device" property are the same
--     fact, not separable design choices.
-- The mitigation is scope, not anonymity: this table is NEVER joined
-- against `events` or `plays` (nothing here would even join cleanly — no
-- shared key), it stores NOTHING beyond what push delivery strictly
-- requires (no IP, no UA, no name/email — `is_standalone` is the only
-- "extra" field, kept purely to distinguish install-prompted vs. tab
-- subscribers in aggregate counts, never to identify one row). If this
-- table is ever queried for anything beyond "who do I send this
-- announcement to," that's a new decision requiring the same scrutiny the
-- `events` table's design got — it doesn't inherit a blanket allowance.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint      TEXT    PRIMARY KEY,
  p256dh        TEXT    NOT NULL,
  auth          TEXT    NOT NULL,
  is_standalone INTEGER NOT NULL,
  created_at    INTEGER NOT NULL  -- unix ms
);

-- No secondary index: the only query this table serves today is "give me
-- every row" (the send script does a full scan — see scripts/send-push.ts),
-- and deletes are by the primary key (`endpoint`) directly on a 404/410
-- cleanup. Add one if a real filtered-send use case shows up later.

-- Useful queries:
--
-- All subscriptions (what the send script reads):
--   SELECT endpoint, p256dh, auth FROM push_subscriptions;
--
-- Subscriber count, standalone vs tab:
--   SELECT is_standalone, COUNT(*) AS n FROM push_subscriptions GROUP BY is_standalone;
--
-- Remove a dead subscription (what the send script does automatically on 404/410):
--   DELETE FROM push_subscriptions WHERE endpoint = ?;

