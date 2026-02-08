CREATE TABLE file_stats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id       UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  path          TEXT NOT NULL,
  commit_count  INT NOT NULL DEFAULT 0,
  recent_count  INT NOT NULL DEFAULT 0,
  last_modified TIMESTAMPTZ,
  UNIQUE(repo_id, path)
);

CREATE TABLE file_cochanges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id         UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  path_a          TEXT NOT NULL,
  path_b          TEXT NOT NULL,
  cochange_count  INT NOT NULL DEFAULT 1,
  UNIQUE(repo_id, path_a, path_b)
);
CREATE INDEX idx_cochanges_lookup ON file_cochanges(repo_id, path_a);

ALTER TABLE repos ADD COLUMN last_git_analysis_commit TEXT;
