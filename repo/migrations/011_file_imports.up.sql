CREATE TABLE file_imports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id     UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  UNIQUE(repo_id, source_path, target_path)
);
CREATE INDEX idx_file_imports_target ON file_imports(repo_id, target_path);
