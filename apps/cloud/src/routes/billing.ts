import { Hono } from "hono";
import { subscriptionQueries } from "@lens/cloud-db";
import { createClient } from "@supabase/supabase-js";
import type { Env } from "../env";
import { apiKeyAuth } from "../middleware/auth";
import { getDb } from "../lib/db";
import { createStripe } from "../lib/stripe";

const billing = new Hono<{ Bindings: Env }>();

// GET /api/billing/subscribe — public, redirects through OAuth then to Stripe
billing.get("/subscribe", async (c) => {
  if (!c.env.STRIPE_SECRET_KEY || c.env.STRIPE_SECRET_KEY.includes("REPLACE_ME")) {
    return c.json({ error: "Stripe not configured" }, 503);
  }

  const interval = c.req.query("interval") === "yearly" ? "yearly" : "monthly";

  // Generate state token, store interval
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes).map((b) => b.toString(36)).join("").slice(0, 32);
  await c.env.RATE_LIMIT.put(`subscribe:${state}`, interval, { expirationTtl: 600 });

  const appUrl = c.env.APP_URL;
  const callbackUrl = `${appUrl}/api/billing/subscribe/callback?state=${state}`;
  const oauthUrl = `${c.env.SUPABASE_URL}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(callbackUrl)}`;

  return c.redirect(oauthUrl);
});

// GET /api/billing/subscribe/callback — OAuth completes, create checkout, redirect to Stripe
billing.get("/subscribe/callback", async (c) => {
  const state = c.req.query("state");
  const accessToken = c.req.query("access_token");

  if (!state || !accessToken) {
    return c.json({ error: "Invalid callback — missing state or token" }, 400);
  }

  const interval = await c.env.RATE_LIMIT.get(`subscribe:${state}`);
  if (!interval) {
    return c.json({ error: "Expired or invalid state" }, 400);
  }
  await c.env.RATE_LIMIT.delete(`subscribe:${state}`);

  // Validate token, get user
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) {
    return c.json({ error: "Authentication failed" }, 401);
  }

  const userId = user.id;
  const db = getDb(c.env.DATABASE_URL);
  const existingSub = await subscriptionQueries.getByUserId(db, userId);

  const stripe = createStripe(c.env.STRIPE_SECRET_KEY);
  const priceId = interval === "yearly" ? c.env.STRIPE_PRICE_YEARLY : c.env.STRIPE_PRICE_MONTHLY;
  const returnUrl = c.env.WEBSITE_URL || c.env.APP_URL;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: existingSub?.stripeCustomerId ?? undefined,
      customer_email: existingSub?.stripeCustomerId ? undefined : (user.email ?? undefined),
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { metadata: { userId } },
      success_url: `${returnUrl}/docs?success=true`,
      cancel_url: `${returnUrl}/#pricing`,
      metadata: { userId },
    });

    if (!session.url) return c.json({ error: "No checkout URL" }, 500);
    return c.redirect(session.url);
  } catch (e: any) {
    console.error("[billing/subscribe/callback]", e?.message);
    return c.json({ error: e?.message ?? "Checkout failed" }, 500);
  }
});

// POST /api/billing/checkout — create Stripe Checkout session (authenticated)
billing.post("/checkout", apiKeyAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env.DATABASE_URL);

  if (!c.env.STRIPE_SECRET_KEY || c.env.STRIPE_SECRET_KEY.includes("REPLACE_ME")) {
    return c.json({ error: "Stripe not configured" }, 503);
  }

  const stripe = createStripe(c.env.STRIPE_SECRET_KEY);
  const sub = await subscriptionQueries.getByUserId(db, userId);

  const body = await c.req.json().catch(() => ({}));
  const interval = body.interval === "yearly" ? "yearly" : "monthly";
  const priceId =
    interval === "yearly" ? c.env.STRIPE_PRICE_YEARLY : c.env.STRIPE_PRICE_MONTHLY;
  const returnUrl = body.return_url || `${c.env.APP_URL}/dashboard/billing`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: sub?.stripeCustomerId ?? undefined,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { metadata: { userId } },
      success_url: `${returnUrl}?success=true`,
      cancel_url: `${returnUrl}?canceled=true`,
      metadata: { userId },
    });

    return c.json({ url: session.url });
  } catch (e: any) {
    console.error("[billing/checkout]", e?.message);
    return c.json({ error: e?.message ?? "Checkout failed" }, 500);
  }
});

// GET /api/billing/portal — Stripe Customer Portal (authenticated)
billing.get("/portal", apiKeyAuth, async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env.DATABASE_URL);

  if (!c.env.STRIPE_SECRET_KEY || c.env.STRIPE_SECRET_KEY.includes("REPLACE_ME")) {
    return c.json({ error: "Stripe not configured" }, 503);
  }

  const stripe = createStripe(c.env.STRIPE_SECRET_KEY);
  const sub = await subscriptionQueries.getByUserId(db, userId);
  if (!sub?.stripeCustomerId) {
    return c.json({ error: "No billing account found" }, 404);
  }

  const returnUrl = c.req.query("return_url") || `${c.env.APP_URL}/dashboard/billing`;
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: returnUrl,
  });

  return c.json({ url: session.url });
});

// POST /api/billing/webhooks/stripe — unauthenticated, signature-verified
billing.post("/webhooks/stripe", async (c) => {
  const stripe = createStripe(c.env.STRIPE_SECRET_KEY);
  const body = await c.req.text();
  const sig = c.req.header("stripe-signature");

  if (!sig) {
    return c.json({ error: "Missing signature" }, 400);
  }

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      c.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return c.json({ error: "Invalid signature" }, 400);
  }

  const db = getDb(c.env.DATABASE_URL);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.userId ?? session.client_reference_id;
      if (!userId) break;

      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string,
      );

      // Ensure subscription metadata has userId for future webhook events
      if (!subscription.metadata?.userId) {
        await stripe.subscriptions.update(subscription.id, {
          metadata: { userId },
        });
      }

      await subscriptionQueries.upsert(db, {
        userId,
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: subscription.id,
        plan: "pro",
        status: "active",
        periodStart: new Date(subscription.current_period_start * 1000),
        periodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      });
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object;
      let userId = sub.metadata?.userId;
      if (!userId) {
        const existing = await subscriptionQueries.getByStripeCustomerId(db, sub.customer as string);
        userId = existing?.userId;
      }
      if (!userId) {
        console.error(`[webhook] subscription.updated: no userId for customer ${sub.customer}`);
        break;
      }

      const plan = sub.status === "active" ? "pro" : "free";
      await subscriptionQueries.upsert(db, {
        userId,
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
        plan,
        status: sub.status,
        periodStart: new Date(sub.current_period_start * 1000),
        periodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      let userId = sub.metadata?.userId;
      if (!userId) {
        const existing = await subscriptionQueries.getByStripeCustomerId(db, sub.customer as string);
        userId = existing?.userId;
      }
      if (!userId) {
        console.error(`[webhook] subscription.deleted: no userId for customer ${sub.customer}`);
        break;
      }

      await subscriptionQueries.upsert(db, {
        userId,
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
        plan: "free",
        status: "canceled",
        periodStart: new Date(sub.current_period_start * 1000),
        periodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: false,
      });
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object;
      const subId = invoice.subscription as string;
      if (!subId || invoice.billing_reason !== "subscription_create") break;

      const sub = await stripe.subscriptions.retrieve(subId);
      let userId = sub.metadata?.userId;
      if (!userId) {
        const existing = await subscriptionQueries.getByStripeCustomerId(db, sub.customer as string);
        userId = existing?.userId;
      }
      if (!userId) {
        console.error(`[webhook] invoice.paid: no userId for customer ${sub.customer}`);
        break;
      }

      await subscriptionQueries.upsert(db, {
        userId,
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
        plan: "pro",
        status: sub.status === "active" ? "active" : sub.status,
        periodStart: new Date(sub.current_period_start * 1000),
        periodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      });
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const subId = invoice.subscription as string;
      if (!subId) break;

      const sub = await stripe.subscriptions.retrieve(subId);
      let userId = sub.metadata?.userId;
      if (!userId) {
        const existing = await subscriptionQueries.getByStripeCustomerId(db, sub.customer as string);
        userId = existing?.userId;
      }
      if (!userId) {
        console.error(`[webhook] invoice.payment_failed: no userId for customer ${sub.customer}`);
        break;
      }

      await subscriptionQueries.upsert(db, {
        userId,
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
        plan: "pro",
        status: "past_due",
        periodStart: new Date(sub.current_period_start * 1000),
        periodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      });
      break;
    }
  }

  return c.json({ received: true });
});

export { billing as billingRoutes };
