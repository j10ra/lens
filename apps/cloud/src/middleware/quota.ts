import { createMiddleware } from "hono/factory";
import { subscriptionQueries, usageQueries, quotaQueries } from "@lens/cloud-db";
import type { Env } from "../env";
import { getDb } from "../lib/db";

interface QuotaLimits {
  maxRepos: number;
  contextQueries: number;
  embeddingRequests: number;
  embeddingChunks: number;
  purposeRequests: number;
  reposIndexed: number;
}

declare module "hono" {
  interface ContextVariableMap {
    usageTotals: Record<string, number> | null;
    usageQuota: QuotaLimits;
  }
}

const ZERO_QUOTA = {
  maxRepos: 3,
  contextQueries: 0,
  embeddingRequests: 0,
  embeddingChunks: 0,
  purposeRequests: 0,
  reposIndexed: 0,
};

export const quotaCheck = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const userId = c.get("userId");
    const db = getDb(c.env.DATABASE_URL);

    const sub = await subscriptionQueries.getByUserId(db, userId);
    const plan = sub?.plan ?? "free";
    const periodStart =
      sub?.currentPeriodStart?.toISOString().slice(0, 10) ??
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const [totals, quotaRow] = await Promise.all([
      usageQueries.getCurrentPeriod(db, userId, periodStart),
      quotaQueries.getByPlan(db, plan),
    ]);

    const { plan: _p, updatedAt: _u, ...limits } = quotaRow ?? { ...ZERO_QUOTA, plan: "free", updatedAt: null };

    c.set("usageTotals", totals);
    c.set("usageQuota", limits);
    await next();
  },
);
