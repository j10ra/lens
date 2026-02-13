import { subscriptionQueries } from "@lens/cloud-db";
import { Hono } from "hono";
import type { Env } from "../env";
import { getDb } from "../lib/db";
import { apiKeyAuth } from "../middleware/auth";

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
