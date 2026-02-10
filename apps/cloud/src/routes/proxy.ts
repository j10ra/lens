import { Hono } from "hono";
import { subscriptionQueries, usageQueries } from "@lens/cloud-db";
import type { Env } from "../env";
import { apiKeyAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import { quotaCheck } from "../middleware/quota";
import { getDb } from "../lib/db";
import { proxyVoyage, proxyOpenRouter } from "../lib/proxy";

const proxy = new Hono<{ Bindings: Env }>();
proxy.use("*", apiKeyAuth);
proxy.use("*", rateLimit);
proxy.use("*", quotaCheck);

async function requirePro(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<string | null> {
  const sub = await subscriptionQueries.getByUserId(db, userId);
  if (!sub || sub.plan !== "pro" || sub.status !== "active") {
    return "Pro plan required";
  }
  return null;
}

// POST /api/proxy/voyage/embed
proxy.post("/voyage/embed", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env.DATABASE_URL);

  const planErr = await requirePro(db, userId);
  if (planErr) return c.json({ error: planErr }, 403);

  const body = await c.req.json<{ input: string[]; model?: string }>();

  if (!body.input || body.input.length > 32) {
    return c.json({ error: "Max 32 chunks per request" }, 400);
  }

  // Quota check
  const usage = c.get("usageTotals") as Record<string, number> | null;
  const quota = c.get("usageQuota") as Record<string, number>;
  if ((usage?.embeddingRequests ?? 0) >= quota.embeddingRequests) {
    return c.json({ error: "Quota exceeded: embedding requests", limit: quota.embeddingRequests }, 429);
  }
  if ((usage?.embeddingChunks ?? 0) + body.input.length > quota.embeddingChunks) {
    return c.json({ error: "Quota exceeded: embedding chunks", limit: quota.embeddingChunks }, 429);
  }

  const upstream = await proxyVoyage(c.env.VOYAGE_API_KEY, {
    model: body.model ?? "voyage-code-3",
    input: body.input,
  });

  const today = new Date().toISOString().slice(0, 10);
  c.executionCtx.waitUntil(
    usageQueries.sync(db, userId, today, {
      embeddingRequests: 1,
      embeddingChunks: body.input.length,
    }),
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
});

// POST /api/proxy/openrouter/chat
proxy.post("/openrouter/chat", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env.DATABASE_URL);

  const planErr = await requirePro(db, userId);
  if (planErr) return c.json({ error: planErr }, 403);

  const body = await c.req.json<{
    model?: string;
    messages: unknown[];
    max_tokens?: number;
  }>();

  if (body.max_tokens && body.max_tokens > 4096) {
    return c.json({ error: "Max 4096 tokens per request" }, 400);
  }

  // Quota check
  const usage = c.get("usageTotals") as Record<string, number> | null;
  const quota = c.get("usageQuota") as Record<string, number>;
  if ((usage?.purposeRequests ?? 0) >= quota.purposeRequests) {
    return c.json({ error: "Quota exceeded: purpose requests", limit: quota.purposeRequests }, 429);
  }

  const upstream = await proxyOpenRouter(c.env.OPENROUTER_API_KEY, {
    model: body.model ?? "qwen/qwen3-coder-next",
    messages: body.messages,
    max_tokens: Math.min(body.max_tokens ?? 2048, 4096),
  });

  const today = new Date().toISOString().slice(0, 10);
  c.executionCtx.waitUntil(
    usageQueries.sync(db, userId, today, { purposeRequests: 1 }),
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
});

export { proxy as proxyRoutes };
