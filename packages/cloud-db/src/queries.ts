import { and, eq, gte, inArray, lte, sql, sum, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";
import { apiKeys, subscriptions, usageDaily } from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

export interface UsageCounters {
  contextQueries?: number;
  embeddingRequests?: number;
  embeddingChunks?: number;
  purposeRequests?: number;
  reposIndexed?: number;
}

export const keyQueries = {
  findByPrefix(db: Db, prefix: string) {
    return db
      .select()
      .from(apiKeys)
      .where(
        and(eq(apiKeys.keyPrefix, prefix), sql`${apiKeys.revokedAt} IS NULL`),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);
  },

  create(
    db: Db,
    userId: string,
    keyHash: string,
    keyPrefix: string,
    name = "default",
  ) {
    return db
      .insert(apiKeys)
      .values({ userId, keyHash, keyPrefix, name })
      .returning()
      .then((rows) => rows[0]!);
  },

  listByUser(db: Db, userId: string) {
    return db
      .select({
        id: apiKeys.id,
        keyPrefix: apiKeys.keyPrefix,
        name: apiKeys.name,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId));
  },

  revoke(db: Db, keyId: string, userId: string) {
    return db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
      .returning()
      .then((rows) => rows[0] ?? null);
  },

  touch(db: Db, keyId: string) {
    return db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, keyId));
  },
};

export const subscriptionQueries = {
  getByUserId(db: Db, userId: string) {
    return db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  },

  upsert(
    db: Db,
    data: {
      userId: string;
      stripeCustomerId: string;
      stripeSubscriptionId: string;
      plan: string;
      status: string;
      periodStart: Date;
      periodEnd: Date;
      cancelAtPeriodEnd: boolean;
    },
  ) {
    return db
      .insert(subscriptions)
      .values({
        userId: data.userId,
        stripeCustomerId: data.stripeCustomerId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        plan: data.plan,
        status: data.status,
        currentPeriodStart: data.periodStart,
        currentPeriodEnd: data.periodEnd,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          stripeCustomerId: sql`EXCLUDED.stripe_customer_id`,
          stripeSubscriptionId: sql`EXCLUDED.stripe_subscription_id`,
          plan: sql`EXCLUDED.plan`,
          status: sql`EXCLUDED.status`,
          currentPeriodStart: sql`EXCLUDED.current_period_start`,
          currentPeriodEnd: sql`EXCLUDED.current_period_end`,
          cancelAtPeriodEnd: sql`EXCLUDED.cancel_at_period_end`,
        },
      })
      .returning()
      .then((rows) => rows[0]!);
  },
};

export const usageQueries = {
  sync(db: Db, userId: string, date: string, counters: UsageCounters) {
    return db
      .insert(usageDaily)
      .values({
        userId,
        date,
        contextQueries: counters.contextQueries ?? 0,
        embeddingRequests: counters.embeddingRequests ?? 0,
        embeddingChunks: counters.embeddingChunks ?? 0,
        purposeRequests: counters.purposeRequests ?? 0,
        reposIndexed: counters.reposIndexed ?? 0,
      })
      .onConflictDoUpdate({
        target: [usageDaily.userId, usageDaily.date],
        set: {
          contextQueries: sql`usage_daily.context_queries + EXCLUDED.context_queries`,
          embeddingRequests: sql`usage_daily.embedding_requests + EXCLUDED.embedding_requests`,
          embeddingChunks: sql`usage_daily.embedding_chunks + EXCLUDED.embedding_chunks`,
          purposeRequests: sql`usage_daily.purpose_requests + EXCLUDED.purpose_requests`,
          reposIndexed: sql`usage_daily.repos_indexed + EXCLUDED.repos_indexed`,
        },
      })
      .returning()
      .then((rows) => rows[0]!);
  },

  getRange(db: Db, userId: string, startDate: string, endDate: string) {
    return db
      .select()
      .from(usageDaily)
      .where(
        and(
          eq(usageDaily.userId, userId),
          gte(usageDaily.date, startDate),
          lte(usageDaily.date, endDate),
        ),
      )
      .orderBy(usageDaily.date);
  },

  getCurrentPeriod(db: Db, userId: string, periodStart: string) {
    return db
      .select({
        contextQueries: sum(usageDaily.contextQueries).mapWith(Number),
        embeddingRequests: sum(usageDaily.embeddingRequests).mapWith(Number),
        embeddingChunks: sum(usageDaily.embeddingChunks).mapWith(Number),
        purposeRequests: sum(usageDaily.purposeRequests).mapWith(Number),
        reposIndexed: sum(usageDaily.reposIndexed).mapWith(Number),
      })
      .from(usageDaily)
      .where(
        and(
          eq(usageDaily.userId, userId),
          gte(usageDaily.date, periodStart),
        ),
      )
      .then((rows) => rows[0] ?? null);
  },
};

export const adminQueries = {
  allKeys(db: Db) {
    return db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
  },

  deleteKeys(db: Db, ids: string[]) {
    if (!ids.length) return;
    return db.delete(apiKeys).where(inArray(apiKeys.id, ids));
  },

  allSubscriptions(db: Db) {
    return db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt));
  },

  allUsage(db: Db, startDate: string, endDate: string) {
    return db
      .select()
      .from(usageDaily)
      .where(and(gte(usageDaily.date, startDate), lte(usageDaily.date, endDate)))
      .orderBy(desc(usageDaily.date));
  },

  globalUsageSummary(db: Db, periodStart: string) {
    return db
      .select({
        totalUsers: sql<number>`count(distinct ${usageDaily.userId})`,
        contextQueries: sum(usageDaily.contextQueries).mapWith(Number),
        embeddingRequests: sum(usageDaily.embeddingRequests).mapWith(Number),
        embeddingChunks: sum(usageDaily.embeddingChunks).mapWith(Number),
        purposeRequests: sum(usageDaily.purposeRequests).mapWith(Number),
        reposIndexed: sum(usageDaily.reposIndexed).mapWith(Number),
      })
      .from(usageDaily)
      .where(gte(usageDaily.date, periodStart))
      .then((rows) => rows[0] ?? null);
  },
};
