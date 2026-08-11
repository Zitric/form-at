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

-- Admin-only: one row per push notification sent from apps/admin's
-- notifications page (Phase D1, 2026-08-01 — the first mutating admin
-- feature). Exists so a recent-sends list can be shown on that page,
-- surfacing an accidental duplicate send (three people have Cloudflare
-- Access; nothing stops two of them sending the same announcement minutes
-- apart, or a page refresh re-submitting) BEFORE it happens again, not
-- just after. `sent_by_email` is the Cloudflare Access identity's verified
-- email (apps/admin/app/utils/verifyAccessJwt.ts) — never trust a
-- client-supplied value for this field. apps/web's own scripts/send-push.ts
-- (the CLI fallback, still available) does not write to this table — it
-- has no D1 binding to write through and remains a Julian-only local tool.
--
-- Not yet applied to the remote database — same "Julian runs it" pattern
-- as `push_subscriptions` above. Do NOT use `--file=apps/web/schema.sql`
-- (this file also contains the one-time, non-idempotent
-- `ALTER TABLE plays ADD COLUMN is_offline` above — running the whole file
-- fails with a duplicate-column error). Run the isolated statement instead:
-- npx wrangler d1 execute form-at-analytics --remote --command "CREATE TABLE IF NOT EXISTS admin_push_sends (id INTEGER PRIMARY KEY AUTOINCREMENT, sent_at INTEGER NOT NULL, sent_by_email TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT, image TEXT, recipient_count INTEGER NOT NULL, sent_count INTEGER NOT NULL, failed_count INTEGER NOT NULL, dead_removed_count INTEGER NOT NULL)"
-- Verify it landed:
-- npx wrangler d1 execute form-at-analytics --remote --command "PRAGMA table_info(admin_push_sends)"
CREATE TABLE IF NOT EXISTS admin_push_sends (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_at            INTEGER NOT NULL,  -- unix ms
  sent_by_email      TEXT    NOT NULL,
  title              TEXT    NOT NULL,
  body               TEXT    NOT NULL,
  url                TEXT,
  image              TEXT,
  recipient_count    INTEGER NOT NULL,
  sent_count         INTEGER NOT NULL,
  failed_count       INTEGER NOT NULL,
  dead_removed_count INTEGER NOT NULL
);

-- Useful queries:
--
-- Recent sends (what the notifications page shows):
--   SELECT sent_at, sent_by_email, title, sent_count, failed_count, dead_removed_count
--   FROM admin_push_sends ORDER BY sent_at DESC LIMIT 10;

-- The sets catalogue (PR1 of the admin set-upload feature, 2026-08-02).
-- Until this feature, `MusicSet` records were a hardcoded array in
-- packages/data/src/sets.ts with no database behind them at all. This table
-- unifies the catalogue in one place going forward — the 4 existing sets are
-- migrated in below with their EXACT current ids, so every existing `plays`/
-- `events` row (keyed by a plain `set_id` string, decoupled from where the
-- MusicSet record itself lives) keeps working unchanged. No split-brain
-- catalogue: this is the one source of truth, not a second copy alongside
-- the static array.
--
-- Nothing reads from or writes to this table yet — that's later PRs
-- (packages/data/src/sets.ts gaining D1-aware query functions, the public
-- /sets and /sets/$id loaders switching to them, and finally the admin
-- upload UI that writes new rows). This PR is pure groundwork: the table
-- exists and the 4 legacy sets are in it, verified to match the static
-- array field-for-field, with nothing else changed.
--
-- `artwork` mirrors the existing bare-path convention (`Image` resolves it
-- to `/images/{artwork}-{width}.{ext}`) for both legacy and future uploaded
-- sets alike. `artwork_original_url` is upload-only (the as-uploaded R2
-- original, used as the always-available fallback until a build generates
-- optimized variants for it — see the upload feature's design notes).
-- `peaks_status` defaults to 'ready' since the upload flow (Option 1: admin
-- runs the existing scripts/generate-peaks.mjs locally and uploads the
-- result) never leaves a set in a pending state — the column exists now so
-- a possible future automated-peaks-generation phase doesn't need a second
-- migration.
--
-- `created_at` (unix ms) is upload/migration recency, NOT the user-entered
-- `date` field — sorting DESC on it is what makes a newly uploaded set
-- "appear at the top of the list". The 4 legacy rows below get 4 DISTINCT
-- values one second apart (not the same migration timestamp) specifically
-- so DESC ordering is deterministic — SQLite gives no guaranteed order
-- among ties, and four rows inserted with an identical timestamp could
-- reorder between requests.
CREATE TABLE IF NOT EXISTS sets (
  id                   TEXT    PRIMARY KEY,
  title                TEXT    NOT NULL,
  artist               TEXT    NOT NULL,
  date                 TEXT    NOT NULL,
  venue                TEXT,
  description          TEXT,
  duration             TEXT,
  src                  TEXT    NOT NULL,
  artwork              TEXT,
  artwork_original_url TEXT,
  peaks                TEXT,
  peaks_status         TEXT    NOT NULL DEFAULT 'ready',
  size_bytes           INTEGER,
  created_at           INTEGER NOT NULL  -- unix ms
);

-- No secondary index yet — every query this table serves so far is either
-- "all rows, newest first" (the public catalogue merge) or "one row by id"
-- (both served fine by the primary key / a full table scan at this table's
-- realistic size). Add one if a real filtered query need shows up later.

-- Not yet applied to the remote database — same "Julian runs it" pattern as
-- every other table in this file. Do NOT use `--file=apps/web/schema.sql`
-- (this file also contains the one-time, non-idempotent
-- `ALTER TABLE plays ADD COLUMN is_offline` above). Run the isolated
-- statements instead, in order:
--
-- 1. Create the table:
-- npx wrangler d1 execute form-at-analytics --remote --command "CREATE TABLE IF NOT EXISTS sets (id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL, date TEXT NOT NULL, venue TEXT, description TEXT, duration TEXT, src TEXT NOT NULL, artwork TEXT, artwork_original_url TEXT, peaks TEXT, peaks_status TEXT NOT NULL DEFAULT 'ready', size_bytes INTEGER, created_at INTEGER NOT NULL)"
--
-- 2. Migrate the 4 existing sets (exact current ids/fields from
--    packages/data/src/sets.ts; created_at values one second apart,
--    highest-first in the static array's current order, so `ORDER BY
--    created_at DESC` reproduces it exactly):
-- npx wrangler d1 execute form-at-analytics --remote --command "INSERT INTO sets (id, title, artist, date, venue, description, duration, src, artwork, peaks, size_bytes, created_at) VALUES ('set-002-til', 'Form:at 002', 't.i.l.', '2026-04-24', 'Find the red door, Glasgow', 'Opening transmission for sequence 002. Establishing the initial connection with deep, hypnotic dub techno.', '45:18', 'https://cdn.formatglasgow.com/002/Form_at%20002%20-%20t.i.l.mp3', 'sets/002', 'https://cdn.formatglasgow.com/002/Form_at%20002%20-%20t.i.l.json', 108761280, 1785707552000)"
-- npx wrangler d1 execute form-at-analytics --remote --command "INSERT INTO sets (id, title, artist, date, venue, description, duration, src, artwork, peaks, size_bytes, created_at) VALUES ('set-002-hubey', 'Form:at 002', 'hubey', '2026-04-24', 'Find the red door, Glasgow', 'Mid-sequence escalation. Elevating the frequency with a high-energy blend of acid, electro, and driving grooves that took total control of the dancefloor.', '1:31:55', 'https://cdn.formatglasgow.com/002/Form_at%20002%20-%20hubey.mp3', 'sets/002', 'https://cdn.formatglasgow.com/002/Form_at%20002%20-%20hubey.json', 220613760, 1785707551000)"
-- npx wrangler d1 execute form-at-analytics --remote --command "INSERT INTO sets (id, title, artist, date, venue, description, duration, src, artwork, peaks, size_bytes, created_at) VALUES ('set-002-brandon-lee-vear', 'Form:at 002', 'Brandon Lee Vear', '2026-04-24', 'Find the red door, Glasgow', 'External operator integrated. A two-hour sustained transmission of deep, hypnotic techno, locking the dancefloor into a continuous loop during peak system hours.', '2:01:55', 'https://cdn.formatglasgow.com/002/Form_at%20002%20-%20Brandon%20Lee%20Vear.mp3.mp3', 'sets/002', 'https://cdn.formatglasgow.com/002/Form_at%20002%20-%20Brandon%20Lee%20Vear.mp3.json', 292611840, 1785707550000)"
-- npx wrangler d1 execute form-at-analytics --remote --command "INSERT INTO sets (id, title, artist, date, venue, description, duration, src, artwork, peaks, size_bytes, created_at) VALUES ('set-002-julz-lever', 'Form:at 002', 'Julz Lever', '2026-04-24', 'Find the red door, Glasgow', 'Closing protocol for sequence 002. High-fidelity techno pushing the system''s architecture to its absolute limit.', '1:39:30', 'https://cdn.formatglasgow.com/002/Form_at%20002%20-%20Julz%20Lever.mp3', 'sets/002', 'https://cdn.formatglasgow.com/002/Form_at%20002%20-%20Julz%20Lever.json', 238804800, 1785707549000)"
--
-- 3. Verify all 4 landed, newest-first order intact:
-- npx wrangler d1 execute form-at-analytics --remote --command "SELECT id, artist, created_at FROM sets ORDER BY created_at DESC"

-- Useful queries:
--
-- Everything, newest upload first (what the public /sets page merges with
-- the build-time static snapshot):
--   SELECT * FROM sets ORDER BY created_at DESC;
--
-- One set by id (detail-page fallback when it's not in the static snapshot):
--   SELECT * FROM sets WHERE id = ?;

-- Admin-only: a full-row audit log for every set deleted through the admin
-- panel's delete action (PR6 of the admin set-upload feature, 2026-08).
-- Deleting a `sets` row is NOT soft-delete — the row is genuinely gone, and
-- nothing else in this system remembers what it contained (R2 objects are
-- deliberately left in place on delete, see PR6's docs, but they're just
-- bytes at a URL with no title/artist/date attached). Without this table, a
-- delete is only "recoverable in principle" — true only if whoever deleted
-- it still remembers the exact metadata to re-create the row. This table
-- makes that recovery actually practical: every column needed to
-- reconstruct the row via a plain INSERT, plus who deleted it, when, and
-- how many real plays it had at the time (context for how consequential
-- the delete was, shown on the admin sets page's "recently deleted" list —
-- same idea as `admin_push_sends` surfacing recent activity, applied to a
-- destructive action instead of a repeatable one).
--
-- `deleted_by_email` is the Cloudflare Access identity's verified email
-- (apps/admin/app/utils/verifyAccessJwt.ts) — never a client-supplied value,
-- same rule `admin_push_sends.sent_by_email` already follows.
--
-- Not yet applied to the remote database — same "Julian runs it" pattern as
-- every other table in this file. Do NOT use `--file=apps/web/schema.sql`.
-- Run the isolated statement instead:
-- npx wrangler d1 execute form-at-analytics --remote --command "CREATE TABLE IF NOT EXISTS admin_deleted_sets (id INTEGER PRIMARY KEY AUTOINCREMENT, deleted_at INTEGER NOT NULL, deleted_by_email TEXT NOT NULL, set_id TEXT NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, date TEXT NOT NULL, venue TEXT, description TEXT, duration TEXT, src TEXT NOT NULL, artwork TEXT, artwork_original_url TEXT, peaks TEXT, size_bytes INTEGER, created_at INTEGER NOT NULL, play_count_at_deletion INTEGER NOT NULL DEFAULT 0)"
-- Verify it landed:
-- npx wrangler d1 execute form-at-analytics --remote --command "PRAGMA table_info(admin_deleted_sets)"
CREATE TABLE IF NOT EXISTS admin_deleted_sets (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  deleted_at             INTEGER NOT NULL,  -- unix ms
  deleted_by_email       TEXT    NOT NULL,
  set_id                 TEXT    NOT NULL,
  title                  TEXT    NOT NULL,
  artist                 TEXT    NOT NULL,
  date                   TEXT    NOT NULL,
  venue                  TEXT,
  description            TEXT,
  duration               TEXT,
  src                    TEXT    NOT NULL,
  artwork                TEXT,
  artwork_original_url   TEXT,
  peaks                  TEXT,
  size_bytes             INTEGER,
  created_at             INTEGER NOT NULL,  -- the row's original created_at, not this log entry's
  play_count_at_deletion INTEGER NOT NULL DEFAULT 0
);

-- restored_at (one-click restore feature, 2026-08) — added after this table
-- already shipped, so it's a separate ALTER rather than part of the CREATE
-- above. Deliberately NOT also added to the CREATE TABLE's own column list
-- (unlike a fresh table's columns, which just get written into the CREATE
-- directly) — same reasoning `plays.is_offline` above already established:
-- keeping the base CREATE exactly as originally applied and adding
-- everything since via ALTER, uniformly, means there's only ONE path
-- (fresh DB or existing) to keep correct, not two that could drift apart.
-- A fresh/dev database runs the CREATE TABLE above, THEN this ALTER, same
-- as an existing production database.
--
-- ⚠️ ONE-TIME MANUAL MIGRATION — NOT idempotent, same confirmed limitation
-- as `plays.is_offline` above (line 25): D1 does NOT support
-- `ADD COLUMN IF NOT EXISTS` the way vanilla SQLite ≥3.35 does — confirmed
-- there via a real `SQLITE_ERROR` when that form was tried against remote
-- D1. Use the bare form below, and do not re-run it once applied (a second
-- run fails with a duplicate-column error).
--
-- npx wrangler d1 execute form-at-analytics --remote --command "ALTER TABLE admin_deleted_sets ADD COLUMN restored_at INTEGER"
-- Verify it landed:
-- npx wrangler d1 execute form-at-analytics --remote --command "PRAGMA table_info(admin_deleted_sets)"
ALTER TABLE admin_deleted_sets ADD COLUMN restored_at INTEGER;

-- No secondary index — this table only ever serves "most recent N deletions"
-- (the admin sets page's recently-deleted list) or a full scan when actually
-- recovering a specific set.

-- Useful queries:
--
-- Recently deleted sets not yet restored (what the admin sets page shows):
--   SELECT id, deleted_at, deleted_by_email, set_id, title, artist, play_count_at_deletion
--   FROM admin_deleted_sets WHERE restored_at IS NULL ORDER BY deleted_at DESC LIMIT 10;
--
-- Restore a deleted set (the one-click admin action does exactly this —
-- INSERT the log row's stored columns back into `sets`, then mark this log
-- entry restored — see routes/api/sets/restore.ts's restoreSetFromLog):
--   SELECT * FROM admin_deleted_sets WHERE id = ? AND restored_at IS NULL;

-- Archived daily Web Analytics (RUM) rows — IMPROVEMENTS.md #12.
--
-- WHY THIS EXISTS: Cloudflare keeps beacon data unsampled for 7 days, then
-- aggregates it to around 10% and eventually drops it. Measured on this site:
-- a 60-day query returned 120 visits extrapolated from 12 real observations,
-- with only 11 of 55 days carrying rows at all — sampling deletes whole days,
-- not just precision. Capturing each day while it is still inside the
-- unsampled window is therefore the ONLY way to hold accurate history past a
-- week. Same shape as the sets snapshot: a stored copy of something
-- authoritative elsewhere, kept because the source degrades.
--
-- RAW, NOT FILTERED: bot rows are stored too (`is_bot`), not dropped at
-- capture. The bot share is itself displayed, filtering would discard
-- information irreversibly for a saving of ~1 row/day, and if the bot
-- classification ever changes the raw rows can be re-derived.
--
-- `sample_interval` is the field that makes a late capture detectable: 1 means
-- the row was captured inside the unsampled window and is exact; above 1 means
-- it was already degraded when archived. Stored per row so the reader can
-- prove provenance instead of assuming it, and so the upsert below can refuse
-- to overwrite good data with bad.
--
-- Not yet applied to the remote database — same "Julian runs it" pattern as
-- the tables above. Do NOT use `--file=apps/web/schema.sql` (this file also
-- contains the one-time, non-idempotent `ALTER TABLE plays ADD COLUMN
-- is_offline` above — running the whole file fails with a duplicate-column
-- error). Run the isolated statement instead:
-- npx wrangler d1 execute form-at-analytics --remote --command "CREATE TABLE IF NOT EXISTS rum_daily (day TEXT NOT NULL, is_bot INTEGER NOT NULL, page_loads INTEGER NOT NULL, visits INTEGER NOT NULL, sample_size INTEGER, sample_interval REAL NOT NULL, captured_at INTEGER NOT NULL, PRIMARY KEY (day, is_bot))"
-- Verify it landed:
-- npx wrangler d1 execute form-at-analytics --remote --command "PRAGMA table_info(rum_daily)"
CREATE TABLE IF NOT EXISTS rum_daily (
  day             TEXT    NOT NULL,  -- YYYY-MM-DD (UTC), Cloudflare's `date` dimension
  is_bot          INTEGER NOT NULL,  -- 0/1, Cloudflare's `bot` dimension
  page_loads      INTEGER NOT NULL,  -- the RUM `count` field
  visits          INTEGER NOT NULL,  -- confidence.sum.visits.estimate
  sample_size     INTEGER,           -- raw samples behind the estimate; NULL when absent
  sample_interval REAL    NOT NULL,  -- 1 = exact; >1 = archived after degrading
  captured_at     INTEGER NOT NULL,  -- unix ms — feeds the staleness disclosure
  -- Composite key, so re-running a capture for a day replaces exactly its own
  -- rows and nothing else. This is what makes the upsert idempotent.
  PRIMARY KEY (day, is_bot)
);

-- THE UPSERT, and the guard that is the whole point of storing
-- `sample_interval`. A run that fires late re-fetches days that have already
-- aged past 7 and come back SAMPLED. Without the WHERE clause, that late run
-- would overwrite exact rows with extrapolated ones — silently destroying the
-- very data the archive exists to preserve, irreversibly, and invisibly until
-- someone compared numbers months later. Never remove it:
--
--   INSERT INTO rum_daily (day, is_bot, page_loads, visits, sample_size, sample_interval, captured_at)
--   VALUES (?, ?, ?, ?, ?, ?, ?)
--   ON CONFLICT(day, is_bot) DO UPDATE SET
--     page_loads      = excluded.page_loads,
--     visits          = excluded.visits,
--     sample_size     = excluded.sample_size,
--     sample_interval = excluded.sample_interval,
--     captured_at     = excluded.captured_at
--   WHERE excluded.sample_interval <= rum_daily.sample_interval;
--
-- Useful queries:
--
-- Daily human visits, newest first (what the history card reads):
--   SELECT day, visits, page_loads, sample_interval FROM rum_daily
--   WHERE is_bot = 0 ORDER BY day DESC;
--
-- Archive freshness (feeds the staleness warning):
--   SELECT MAX(day) AS newest_day, MAX(captured_at) AS last_capture FROM rum_daily;
--
-- Any rows archived late, i.e. already degraded when captured:
--   SELECT day, sample_interval FROM rum_daily WHERE sample_interval > 1 ORDER BY day;
