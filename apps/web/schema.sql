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
-- design — no backfill attempted). `IF NOT EXISTS` makes this statement safe
-- to re-run, so schema.sql stays fully idempotent like every statement
-- above (SQLite/D1 support `ADD COLUMN IF NOT EXISTS` since SQLite 3.35).
ALTER TABLE plays ADD COLUMN IF NOT EXISTS is_offline INTEGER;

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
