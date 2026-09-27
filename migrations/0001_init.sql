-- All timestamps are unix epoch milliseconds

CREATE TABLE feeds (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  url           TEXT    NOT NULL UNIQUE,
  title         TEXT,
  etag          TEXT,
  last_modified TEXT,
  -- Seen item keys (JSON array, newest first, capped)
  seen_keys     TEXT    NOT NULL DEFAULT '[]',
  next_fetch_at INTEGER NOT NULL DEFAULT 0,
  fail_count    INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_feeds_next_fetch_at ON feeds (next_fetch_at);

CREATE TABLE subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id    INTEGER NOT NULL REFERENCES feeds (id) ON DELETE CASCADE,
  guild_id   TEXT    NOT NULL,
  channel_id TEXT    NOT NULL,
  created_by TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (feed_id, channel_id)
);
CREATE INDEX idx_subscriptions_guild_id ON subscriptions (guild_id);
