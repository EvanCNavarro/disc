-- Migration 016: Usage event tracking for billing/cost visibility
-- Every AI API call (OpenAI LLM or Replicate image) gets one row.

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,

  -- What happened
  action_type TEXT NOT NULL,
  model TEXT NOT NULL,

  -- Context (all nullable — depends on action type)
  generation_id TEXT,
  playlist_id TEXT,
  style_id TEXT,
  job_id TEXT,

  -- Metrics
  tokens_in INTEGER,
  tokens_out INTEGER,
  duration_ms INTEGER,

  -- Cost
  model_unit_cost REAL,
  cost_usd REAL NOT NULL,

  -- Metadata
  trigger_source TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_date ON usage_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_action ON usage_events(action_type);
