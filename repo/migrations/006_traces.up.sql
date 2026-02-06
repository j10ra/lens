CREATE TABLE traces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id       UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  task_goal     TEXT NOT NULL,
  step          TEXT NOT NULL,
  input         JSONB,
  output        JSONB,
  status        TEXT NOT NULL,
  duration_ms   INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_traces_repo ON traces(repo_id);
