import { Hono } from "hono";
import {
  subscriptionQueries,
  usageQueries,
  quotaQueries,
  type UsageCounters,
} from "@lens/cloud-db";
import type { Env } from "../env";
import { apiKeyAuth } from "../middleware/auth";
import { getDb } from "../lib/db";

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
  const plan = (sub?.plan ?? "free").trim();
  const periodStart =
    sub?.currentPeriodStart?.toISOString().slice(0, 10) ??
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [totals, quotaRow] = await Promise.all([
    usageQueries.getCurrentPeriod(db, userId, periodStart),
    quotaQueries.getByPlan(db, plan),
  ]);

  const quota = quotaRow ?? {
    maxRepos: 3,
    contextQueries: 0,
    embeddingRequests: 0,
    embeddingChunks: 0,
    purposeRequests: 0,
    reposIndexed: 0,
  };

  return c.json({
    plan,
    periodStart,
    usage: totals,
    quota,
  });
});

export { usage as usageRoutes };
