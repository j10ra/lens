import { createDb, type Db } from "@lens/cloud-db";

let db: Db | null = null;

export function getServerDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    db = createDb(url);
  }
  return db;
}
