-- Worker activity tick logging
-- Tracks every cron/watcher/heartbeat/manual execution for observability.
-- 30-day retention, self-pruning (see workers/cron/src/index.ts heartbeat).

CREATE TABLE IF NOT EXISTS worker_ticks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT,
  tick_type TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  playlists_checked INTEGER,
  playlists_processed INTEGER,
  token_refreshed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_worker_ticks_date ON worker_ticks(created_at);
CREATE INDEX IF NOT EXISTS idx_worker_ticks_type ON worker_ticks(tick_type, created_at);
