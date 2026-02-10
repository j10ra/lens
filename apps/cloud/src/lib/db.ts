import { createDb, type Db } from "@lens/cloud-db";

const cache = new Map<string, Db>();

export function getDb(databaseUrl: string): Db {
  let db = cache.get(databaseUrl);
  if (!db) {
    db = createDb(databaseUrl);
    cache.set(databaseUrl, db);
  }
  return db;
}
