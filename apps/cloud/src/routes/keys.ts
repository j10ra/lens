import { keyQueries } from "@lens/cloud-db";
import { Hono } from "hono";
import type { Env } from "../env";
import { getDb } from "../lib/db";
import { generateApiKey, hashKey } from "../lib/keys";
import { apiKeyAuth } from "../middleware/auth";

const keys = new Hono<{ Bindings: Env }>();
keys.use("*", apiKeyAuth);

// POST /api/keys — create new API key
keys.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ name?: string }>().catch(() => ({ name: undefined }));
  const db = getDb(c.env.DATABASE_URL);

  const { full, prefix } = generateApiKey();
  const hash = await hashKey(full);
  const row = await keyQueries.create(db, userId, hash, prefix, body.name);

  return c.json(
    {
      id: row.id,
      key: full,
      prefix: row.keyPrefix,
      name: row.name,
      createdAt: row.createdAt,
    },
    201,
  );
});

// GET /api/keys — list user keys
keys.get("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env.DATABASE_URL);
  const rows = await keyQueries.listByUser(db, userId);
  return c.json({ keys: rows });
});

// DELETE /api/keys/:id — revoke key
keys.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const keyId = c.req.param("id");
  const db = getDb(c.env.DATABASE_URL);
  const revoked = await keyQueries.revoke(db, keyId, userId);

  if (!revoked) {
    return c.json({ error: "Key not found" }, 404);
  }

  return c.json({ ok: true });
});

export { keys as keyRoutes };
