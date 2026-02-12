import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

let _db: Db | null = null;
let _raw: Database.Database | null = null;

function resolveDbPath(customPath?: string): string {
  if (customPath) return customPath;
  const dir = join(homedir(), ".lens");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "data.db");
}

export function openDb(customPath?: string): Db {
  if (_db) return _db;

  const dbPath = resolveDbPath(customPath);
  const sqlite = new Database(dbPath);

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Create tables (idempotent)
  sqlite.exec(createTablesSql());

  // Migrate: add sections + internals columns to file_metadata
  const cols = new Set(
    (sqlite.pragma("table_info(file_metadata)") as { name: string }[]).map((c) => c.name),
  );
  if (!cols.has("sections")) sqlite.exec("ALTER TABLE file_metadata ADD COLUMN sections TEXT DEFAULT '[]'");
  if (!cols.has("internals")) sqlite.exec("ALTER TABLE file_metadata ADD COLUMN internals TEXT DEFAULT '[]'");

  _db = db;
  _raw = sqlite;
  return db;
}

export function getDb(): Db {
  if (!_db) throw new Error("Database not initialized. Call openDb() first.");
  return _db;
}

export function getRawDb(): Database.Database {
  if (!_raw) throw new Error("Database not initialized. Call openDb() first.");
  return _raw;
}

export function closeDb(): void {
  if (_raw) _raw.close();
  _db = null;
  _raw = null;
}

function createTablesSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS repos (
      id TEXT PRIMARY KEY,
      identity_key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      remote_url TEXT,
      last_indexed_commit TEXT,
      index_status TEXT NOT NULL DEFAULT 'pending',
      last_indexed_at TEXT,
      last_git_analysis_commit TEXT,
      max_import_depth INTEGER DEFAULT 0,
      vocab_clusters TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      language TEXT,
      embedding BLOB,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(repo_id, path, chunk_index, chunk_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_repo_path ON chunks(repo_id, path);
    CREATE INDEX IF NOT EXISTS idx_chunks_repo ON chunks(repo_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(repo_id, chunk_hash);

    CREATE TABLE IF NOT EXISTS file_metadata (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      language TEXT,
      exports TEXT DEFAULT '[]',
      imports TEXT DEFAULT '[]',
      docstring TEXT DEFAULT '',
      sections TEXT DEFAULT '[]',
      internals TEXT DEFAULT '[]',
      purpose TEXT DEFAULT '',
      purpose_hash TEXT DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(repo_id, path)
    );
    CREATE INDEX IF NOT EXISTS idx_file_metadata_repo ON file_metadata(repo_id);

    CREATE TABLE IF NOT EXISTS file_imports (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      source_path TEXT NOT NULL,
      target_path TEXT NOT NULL,
      UNIQUE(repo_id, source_path, target_path)
    );
    CREATE INDEX IF NOT EXISTS idx_file_imports_target ON file_imports(repo_id, target_path);

    CREATE TABLE IF NOT EXISTS file_stats (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      commit_count INTEGER NOT NULL DEFAULT 0,
      recent_count INTEGER NOT NULL DEFAULT 0,
      last_modified TEXT,
      UNIQUE(repo_id, path)
    );

    CREATE TABLE IF NOT EXISTS file_cochanges (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      path_a TEXT NOT NULL,
      path_b TEXT NOT NULL,
      cochange_count INTEGER NOT NULL DEFAULT 1,
      UNIQUE(repo_id, path_a, path_b)
    );
    CREATE INDEX IF NOT EXISTS idx_cochanges_lookup ON file_cochanges(repo_id, path_a);

    CREATE TABLE IF NOT EXISTS usage_counters (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      context_queries INTEGER NOT NULL DEFAULT 0,
      embedding_requests INTEGER NOT NULL DEFAULT 0,
      embedding_chunks INTEGER NOT NULL DEFAULT 0,
      purpose_requests INTEGER NOT NULL DEFAULT 0,
      repos_indexed INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_usage_counters_date ON usage_counters(date);

    CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'api',
      request_body TEXT,
      response_size INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_request_logs_created ON request_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_request_logs_source ON request_logs(source);

    CREATE TABLE IF NOT EXISTS telemetry_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      event_data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_telemetry_events_type ON telemetry_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_telemetry_events_synced ON telemetry_events(synced_at);
  `;
}
