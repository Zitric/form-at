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
