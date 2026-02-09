import { createServerFn } from "@tanstack/react-start";
import { getServerDb } from "./db.server";
import {
  keyQueries,
  usageQueries,
  subscriptionQueries,
} from "@lens/cloud-db";
import { generateApiKey, hashKey } from "../../src/lib/keys";

// --- Plan quota limits ---

const PLAN_QUOTAS: Record<string, {
  contextQueries: number;
  embeddingRequests: number;
  purposeRequests: number;
  maxKeys: number;
}> = {
  free: { contextQueries: 500, embeddingRequests: 5000, purposeRequests: 200, maxKeys: 1 },
  pro: { contextQueries: 5000, embeddingRequests: 50000, purposeRequests: 2000, maxKeys: 5 },
};

// --- API Keys ---

export const getApiKeys = createServerFn({ method: "GET" })
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data }) => {
    const db = getServerDb();
    return keyQueries.listByUser(db, data.userId);
  });

export const createApiKey = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string; name: string }) => input)
  .handler(async ({ data }) => {
    const db = getServerDb();
    const { full, prefix } = generateApiKey();
    const hash = await hashKey(full);
    const row = await keyQueries.create(db, data.userId, hash, prefix, data.name);
    return { ...row, fullKey: full };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .inputValidator((input: { keyId: string; userId: string }) => input)
  .handler(async ({ data }) => {
    const db = getServerDb();
    return keyQueries.revoke(db, data.keyId, data.userId);
  });

// --- Usage ---

export const getUsageCurrent = createServerFn({ method: "GET" })
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data }) => {
    const db = getServerDb();
    const sub = await subscriptionQueries.getByUserId(db, data.userId);
    const plan = sub?.plan ?? "free";
    const quotas = PLAN_QUOTAS[plan] ?? PLAN_QUOTAS.free;

    const periodStart = sub?.currentPeriodStart
      ? sub.currentPeriodStart.toISOString().split("T")[0]
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          .toISOString()
          .split("T")[0];

    const periodEnd = sub?.currentPeriodEnd
      ? sub.currentPeriodEnd.toISOString().split("T")[0]
      : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
          .toISOString()
          .split("T")[0];

    const usage = await usageQueries.getCurrentPeriod(db, data.userId, periodStart);

    return {
      periodStart,
      periodEnd,
      plan,
      quotas,
      usage: {
        contextQueries: usage?.contextQueries ?? 0,
        embeddingRequests: usage?.embeddingRequests ?? 0,
        purposeRequests: usage?.purposeRequests ?? 0,
        reposIndexed: usage?.reposIndexed ?? 0,
      },
    };
  });

export const getUsageRange = createServerFn({ method: "GET" })
  .inputValidator((input: { userId: string; start: string; end: string }) => input)
  .handler(async ({ data }) => {
    const db = getServerDb();
    return usageQueries.getRange(db, data.userId, data.start, data.end);
  });

// --- Subscription ---

export const getSubscription = createServerFn({ method: "GET" })
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data }) => {
    const db = getServerDb();
    return subscriptionQueries.getByUserId(db, data.userId);
  });

// --- Billing (Stripe) ---

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data }) => {
    const { createStripe } = await import("../../src/lib/stripe");
    const stripe = createStripe(process.env.STRIPE_SECRET_KEY!);
    const db = getServerDb();
    const sub = await subscriptionQueries.getByUserId(db, data.userId);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: sub?.stripeCustomerId ?? undefined,
      client_reference_id: data.userId,
      line_items: [{ price: "price_lens_pro", quantity: 1 }],
      success_url: `${process.env.VITE_SUPABASE_URL ? "https://lens.dev" : "http://localhost:3001"}/dashboard/billing?success=true`,
      cancel_url: `${process.env.VITE_SUPABASE_URL ? "https://lens.dev" : "http://localhost:3001"}/dashboard/billing?canceled=true`,
      metadata: { userId: data.userId },
    });

    return { url: session.url };
  });

export const getPortalUrl = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data }) => {
    const { createStripe } = await import("../../src/lib/stripe");
    const stripe = createStripe(process.env.STRIPE_SECRET_KEY!);
    const db = getServerDb();
    const sub = await subscriptionQueries.getByUserId(db, data.userId);

    if (!sub?.stripeCustomerId) {
      return { url: null, error: "No billing account found" };
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${process.env.VITE_SUPABASE_URL ? "https://lens.dev" : "http://localhost:3001"}/dashboard/billing`,
    });

    return { url: session.url };
  });
