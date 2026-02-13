import { boolean, date, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const planQuotas = pgTable("plan_quotas", {
  plan: text("plan").primaryKey(),
  maxRepos: integer("max_repos").notNull().default(50),
  contextQueries: integer("context_queries").notNull().default(0),
  embeddingRequests: integer("embedding_requests").notNull().default(0),
  embeddingChunks: integer("embedding_chunks").notNull().default(0),
  purposeRequests: integer("purpose_requests").notNull().default(0),
  reposIndexed: integer("repos_indexed").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  name: text("name").default("default"),
  scopes: text("scopes").default('["proxy"]'),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: text("plan").default("free"),
  status: text("status").default("active"),
  currentPeriodStart: timestamp("current_period_start", {
    withTimezone: true,
  }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const usageDaily = pgTable(
  "usage_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    date: date("date").notNull(),
    contextQueries: integer("context_queries").default(0),
    embeddingRequests: integer("embedding_requests").default(0),
    embeddingChunks: integer("embedding_chunks").default(0),
    purposeRequests: integer("purpose_requests").default(0),
    reposIndexed: integer("repos_indexed").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique("usage_daily_user_date").on(t.userId, t.date)],
);
