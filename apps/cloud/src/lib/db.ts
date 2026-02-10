import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@lens/cloud-db";

const cache = new Map<string, ReturnType<typeof drizzle>>();

export function getDb(databaseUrl: string) {
  let db = cache.get(databaseUrl);
  if (!db) {
    const client = postgres(databaseUrl, { prepare: false, max: 5 });
    db = drizzle(client, { schema });
    cache.set(databaseUrl, db);
  }
  return db;
}
