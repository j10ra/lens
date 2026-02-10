import { createMiddleware } from "hono/factory";
import { subscriptionQueries, usageQueries } from "@lens/cloud-db";
import type { Env } from "../env";
import { getDb } from "../lib/db";
import { QUOTAS } from "../routes/usage";

export const quotaCheck = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const userId = c.get("userId");
    const db = getDb(c.env.DATABASE_URL);

    const sub = await subscriptionQueries.getByUserId(db, userId);
    const plan = sub?.plan ?? "free";
    const periodStart =
      sub?.currentPeriodStart?.toISOString().slice(0, 10) ??
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const totals = await usageQueries.getCurrentPeriod(db, userId, periodStart);
    const quota = QUOTAS[plan] ?? QUOTAS.free;

    c.set("usageTotals", totals);
    c.set("usageQuota", quota);
    await next();
  },
);
