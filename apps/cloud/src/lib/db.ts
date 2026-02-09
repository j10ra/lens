import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@lens/cloud-db";

export function getDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { prepare: false });
  return drizzle(client, { schema });
}
