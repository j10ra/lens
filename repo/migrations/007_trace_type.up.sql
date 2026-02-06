ALTER TABLE traces ADD COLUMN trace_type TEXT NOT NULL DEFAULT 'run';
ALTER TABLE traces ADD CONSTRAINT chk_trace_type
  CHECK (trace_type IN ('run', 'search', 'read', 'summary'));
CREATE INDEX idx_traces_repo_recent ON traces(repo_id, created_at DESC);
CREATE INDEX idx_traces_repo_type ON traces(repo_id, trace_type);
