import { keyQueries } from "@lens/cloud-db";
import { createMiddleware } from "hono/factory";
import type { Env } from "../env";
import { getDb } from "../lib/db";
import { hashKey } from "../lib/keys";

declare module "hono" {
  interface ContextVariableMap {
    userId: string;
    apiKeyId: string;
  }
}

export const apiKeyAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer lk_")) {
    return c.json({ error: "Missing or invalid API key" }, 401);
  }

  const fullKey = header.slice(7);
  const prefix = fullKey.slice(0, 12);
  const db = getDb(c.env.DATABASE_URL);
  const row = await keyQueries.findByPrefix(db, prefix);

  if (!row) {
    return c.json({ error: "API key not found" }, 401);
  }

  if (row.revokedAt) {
    return c.json({ error: "API key revoked" }, 401);
  }

  if (row.expiresAt && row.expiresAt < new Date()) {
    return c.json({ error: "API key expired" }, 401);
  }

  const hash = await hashKey(fullKey);
  if (hash !== row.keyHash) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  c.set("userId", row.userId);
  c.set("apiKeyId", row.id);

  c.executionCtx.waitUntil(keyQueries.touch(db, row.id));

  await next();
});
