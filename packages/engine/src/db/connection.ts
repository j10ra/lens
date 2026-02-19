import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

let _db: Db | null = null;

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY,
  identity_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  remote_url TEXT,
  last_indexed_commit TEXT,
  index_status TEXT NOT NULL DEFAULT 'pending',
  last_indexed_at TEXT,
  last_git_analysis_commit TEXT,
  max_import_depth INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_repos_identity ON repos(identity_key);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  content TEXT NOT NULL,
  chunk_hash TEXT NOT NULL,
  last_seen_commit TEXT NOT NULL,
  language TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_unique ON chunks(repo_id, path, chunk_index, chunk_hash);
CREATE INDEX IF NOT EXISTS idx_chunks_repo_path ON chunks(repo_id, path);

CREATE TABLE IF NOT EXISTS file_metadata (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  language TEXT,
  exports TEXT DEFAULT '[]',
  imports TEXT DEFAULT '[]',
  docstring TEXT DEFAULT '',
  sections TEXT DEFAULT '[]',
  internals TEXT DEFAULT '[]'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_metadata_unique ON file_metadata(repo_id, path);

CREATE TABLE IF NOT EXISTS file_imports (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_imports_unique ON file_imports(repo_id, source_path, target_path);
CREATE INDEX IF NOT EXISTS idx_file_imports_target ON file_imports(repo_id, target_path);
CREATE INDEX IF NOT EXISTS idx_file_imports_source ON file_imports(repo_id, source_path);

CREATE TABLE IF NOT EXISTS file_stats (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  commit_count INTEGER NOT NULL DEFAULT 0,
  recent_count INTEGER NOT NULL DEFAULT 0,
  last_modified TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_stats_unique ON file_stats(repo_id, path);

CREATE TABLE IF NOT EXISTS file_cochanges (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  path_a TEXT NOT NULL,
  path_b TEXT NOT NULL,
  cochange_count INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_cochanges_unique ON file_cochanges(repo_id, path_a, path_b);
CREATE INDEX IF NOT EXISTS idx_cochanges_lookup ON file_cochanges(repo_id, path_a);
`;

export function configureEngineDb(dbPath: string): Db {
  if (_db) return _db;
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(CREATE_TABLES_SQL);
  _db = drizzle(sqlite, { schema });
  return _db;
}

export function getEngineDb(): Db {
  if (!_db) throw new Error("Engine DB not initialized. Call configureEngineDb() first.");
  return _db;
}
