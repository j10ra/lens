import { subscriptionQueries } from "@lens/cloud-db";
import { createClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import type Stripe from "stripe";
import type { Env } from "../env";
import { getDb } from "../lib/db";
import { createStripe } from "../lib/stripe";
import { apiKeyAuth } from "../middleware/auth";

const billing = new Hono<{ Bindings: Env }>();

// GET /api/billing/subscribe — public, shows provider picker or redirects to OAuth
billing.get("/subscribe", async (c) => {
  if (!c.env.STRIPE_SECRET_KEY || c.env.STRIPE_SECRET_KEY.includes("REPLACE_ME")) {
    return c.json({ error: "Stripe not configured" }, 503);
  }

  const interval = c.req.query("interval") === "yearly" ? "yearly" : "monthly";
  const provider = c.req.query("provider");

  // If provider specified, go straight to OAuth
  if (provider === "github" || provider === "google") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const state = Array.from(bytes)
      .map((b) => b.toString(36))
      .join("")
      .slice(0, 32);
    await c.env.RATE_LIMIT.put(`subscribe:${state}`, interval, { expirationTtl: 600 });

    const appUrl = c.env.APP_URL;
    const callbackUrl = `${appUrl}/api/billing/subscribe/callback?state=${state}`;
    const oauthUrl = `${c.env.SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(callbackUrl)}`;
    return c.redirect(oauthUrl);
  }

  // No provider — show picker page
  const plan = interval === "yearly" ? "Pro Yearly ($90/yr)" : "Pro ($9/mo)";
  const base = c.req.url.split("?")[0];
  const ghUrl = `${base}?interval=${interval}&provider=github`;
  const glUrl = `${base}?interval=${interval}&provider=google`;

  return c.html(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Subscribe to LENS ${plan}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#fafafa;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{max-width:380px;width:100%;padding:2.5rem;border:1px solid #262626;border-radius:1rem;background:#111}
  h1{font-size:1.25rem;font-weight:600;margin-bottom:.5rem}
  p{font-size:.875rem;color:#a1a1aa;margin-bottom:2rem}
  a{display:flex;align-items:center;justify-content:center;gap:.5rem;width:100%;padding:.75rem;border-radius:.5rem;font-size:.875rem;font-weight:500;text-decoration:none;transition:background .15s}
  .gh{background:#24292f;color:#fff;margin-bottom:.75rem} .gh:hover{background:#2d333b}
  .gl{background:#fff;color:#111;border:1px solid #333} .gl:hover{background:#e5e5e5}
  svg{width:20px;height:20px}
</style>
</head><body>
<div class="card">
  <h1>${plan}</h1>
  <p>Sign in to continue to checkout.</p>
  <a href="${ghUrl}" class="gh">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
    Continue with GitHub
  </a>
  <a href="${glUrl}" class="gl">
    <svg viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
    Continue with Google
  </a>
</div>
</body></html>`);
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
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);
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
  const priceId = interval === "yearly" ? c.env.STRIPE_PRICE_YEARLY : c.env.STRIPE_PRICE_MONTHLY;
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

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, c.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return c.json({ error: "Invalid signature" }, 400);
  }

  const db = getDb(c.env.DATABASE_URL);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.userId ?? session.client_reference_id;
      if (!userId) break;

      const subscription = await stripe.subscriptions.retrieve(session.subscription as string);

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
