import { Hono } from "hono";
import { subscriptionQueries } from "@lens/cloud-db";
import type { Env } from "../env";
import { apiKeyAuth } from "../middleware/auth";
import { getDb } from "../lib/db";

const subscription = new Hono<{ Bindings: Env }>();
subscription.use("*", apiKeyAuth);

// GET /api/subscription — current user's subscription
subscription.get("/", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env.DATABASE_URL);
  const sub = await subscriptionQueries.getByUserId(db, userId);
  return c.json({ subscription: sub ?? { plan: "free", status: "active" } });
});

export { subscription as subscriptionRoutes };
