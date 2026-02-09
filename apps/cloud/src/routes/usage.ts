import { Hono } from "hono";
import {
  subscriptionQueries,
  usageQueries,
  type UsageCounters,
} from "@lens/cloud-db";
import type { Env } from "../env";
import { apiKeyAuth } from "../middleware/auth";
import { getDb } from "../lib/db";

const QUOTAS: Record<string, Record<string, number>> = {
  free: {
    contextQueries: 100,
    embeddingRequests: 50,
    embeddingChunks: 5000,
    purposeRequests: 20,
    reposIndexed: 3,
  },
  pro: {
    contextQueries: 10000,
    embeddingRequests: 5000,
    embeddingChunks: 500000,
    purposeRequests: 2000,
    reposIndexed: 100,
  },
};

const usage = new Hono<{ Bindings: Env }>();
usage.use("*", apiKeyAuth);

// POST /api/usage/sync — increment daily counters
usage.post("/sync", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ date: string; counters: UsageCounters }>();
  const db = getDb(c.env.DATABASE_URL);
  const row = await usageQueries.sync(db, userId, body.date, body.counters);
  return c.json({ usage: row });
});

// GET /api/usage — usage for date range
usage.get("/", async (c) => {
  const userId = c.get("userId");
  const start = c.req.query("start");
  const end = c.req.query("end");

  if (!start || !end) {
    return c.json({ error: "start and end query params required" }, 400);
  }

  const db = getDb(c.env.DATABASE_URL);
  const rows = await usageQueries.getRange(db, userId, start, end);
  return c.json({ usage: rows });
});

// GET /api/usage/current — current period totals + quota
usage.get("/current", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env.DATABASE_URL);
  const sub = await subscriptionQueries.getByUserId(db, userId);
  const plan = sub?.plan ?? "free";
  const periodStart =
    sub?.currentPeriodStart?.toISOString().slice(0, 10) ??
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const totals = await usageQueries.getCurrentPeriod(
    db,
    userId,
    periodStart,
  );

  const quota = QUOTAS[plan] ?? QUOTAS.free;

  return c.json({
    plan,
    periodStart,
    usage: totals,
    quota,
  });
});

export { usage as usageRoutes };
export { QUOTAS };
