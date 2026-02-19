import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";

declare const __filename: string | undefined;
const _file = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const _dirname = dirname(_file);

export type Db = BetterSQLite3Database<typeof schema>;

let _db: Db | null = null;
let _sqlite: Database.Database | null = null;

export function configureEngineDb(dbPath: string): Db {
  if (_db) return _db;
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");

  _sqlite = sqlite;
  _db = drizzle(sqlite, { schema });

  const migrationsFolder = join(_dirname, "..", "drizzle");
  migrate(_db, { migrationsFolder });

  return _db;
}

export function getEngineDb(): Db {
  if (!_db) throw new Error("Engine DB not initialized. Call configureEngineDb() first.");
  return _db;
}

/** Returns raw better-sqlite3 instance for complex queries not easily expressed in drizzle. */
export function getRawDb(): Database.Database {
  if (!_sqlite) throw new Error("Engine DB not initialized. Call configureEngineDb() first.");
  return _sqlite;
}
