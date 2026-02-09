import { Hono } from "hono";
import { subscriptionQueries } from "@lens/cloud-db";
import type { Env } from "../env";
import { apiKeyAuth } from "../middleware/auth";
import { getDb } from "../lib/db";
import { createStripe } from "../lib/stripe";

const billing = new Hono<{ Bindings: Env }>();

// Authenticated routes
const authed = new Hono<{ Bindings: Env }>();
authed.use("*", apiKeyAuth);

// POST /api/billing/checkout — create Stripe Checkout session
authed.post("/checkout", async (c) => {
  const userId = c.get("userId");
  const stripe = createStripe(c.env.STRIPE_SECRET_KEY);
  const db = getDb(c.env.DATABASE_URL);

  const sub = await subscriptionQueries.getByUserId(db, userId);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: sub?.stripeCustomerId ?? undefined,
    client_reference_id: userId,
    line_items: [{ price: "price_lens_pro", quantity: 1 }],
    success_url: "https://lens.dev/billing?success=true",
    cancel_url: "https://lens.dev/billing?canceled=true",
    metadata: { userId },
  });

  return c.json({ url: session.url });
});

// GET /api/billing/portal — Stripe Customer Portal
authed.get("/portal", async (c) => {
  const userId = c.get("userId");
  const stripe = createStripe(c.env.STRIPE_SECRET_KEY);
  const db = getDb(c.env.DATABASE_URL);

  const sub = await subscriptionQueries.getByUserId(db, userId);
  if (!sub?.stripeCustomerId) {
    return c.json({ error: "No billing account found" }, 404);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: "https://lens.dev/billing",
  });

  return c.json({ url: session.url });
});

billing.route("/", authed);

// POST /api/webhooks/stripe — unauthenticated, signature-verified
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
      const userId = sub.metadata?.userId;
      if (!userId) break;

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
      const userId = sub.metadata?.userId;
      if (!userId) break;

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

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const subId = invoice.subscription as string;
      if (!subId) break;

      const sub = await stripe.subscriptions.retrieve(subId);
      const userId = sub.metadata?.userId;
      if (!userId) break;

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
