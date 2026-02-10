import { subscriptionQueries, usageQueries } from "@lens/cloud-db";
import { Hono } from "hono";
import type { Env } from "../env";
import { getDb } from "../lib/db";
import { proxyOpenRouter, proxyVoyage } from "../lib/proxy";
import { apiKeyAuth } from "../middleware/auth";
import { quotaCheck } from "../middleware/quota";
import { rateLimit } from "../middleware/rate-limit";

const EMBED_MODELS = new Set(["voyage-code-3"]);
const CHAT_MODELS = new Set(["qwen/qwen3-coder-next"]);

const proxy = new Hono<{ Bindings: Env }>();
proxy.use("*", apiKeyAuth);
proxy.use("*", rateLimit);
proxy.use("*", quotaCheck);

async function requirePro(db: ReturnType<typeof getDb>, userId: string): Promise<string | null> {
  const sub = await subscriptionQueries.getByUserId(db, userId);
  if (!sub || sub.plan !== "pro" || sub.status !== "active") {
    return "Pro plan required";
  }
  return null;
}

// POST /api/proxy/embed
proxy.post("/embed", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env.DATABASE_URL);

  const planErr = await requirePro(db, userId);
  if (planErr) return c.json({ error: planErr }, 403);

  const body = await c.req.json<{ input: string[]; model?: string }>();
  const model = body.model ?? "voyage-code-3";

  if (!EMBED_MODELS.has(model)) {
    return c.json({ error: `Model not allowed: ${model}`, allowed: [...EMBED_MODELS] }, 400);
  }

  if (!body.input || body.input.length > 32) {
    return c.json({ error: "Max 32 chunks per request" }, 400);
  }

  // Quota check
  const usage = c.get("usageTotals");
  const quota = c.get("usageQuota");
  if ((usage?.embeddingRequests ?? 0) >= quota.embeddingRequests) {
    return c.json({ error: "Quota exceeded: embedding requests", limit: quota.embeddingRequests }, 429);
  }
  if ((usage?.embeddingChunks ?? 0) + body.input.length > quota.embeddingChunks) {
    return c.json({ error: "Quota exceeded: embedding chunks", limit: quota.embeddingChunks }, 429);
  }

  const upstream = await proxyVoyage(c.env.VOYAGE_API_KEY, {
    model,
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

// POST /api/proxy/chat
proxy.post("/chat", async (c) => {
  const userId = c.get("userId");
  const db = getDb(c.env.DATABASE_URL);

  const planErr = await requirePro(db, userId);
  if (planErr) return c.json({ error: planErr }, 403);

  const body = await c.req.json<{
    model?: string;
    messages: unknown[];
    max_tokens?: number;
  }>();
  const model = body.model ?? "qwen/qwen3-coder-next";

  if (!CHAT_MODELS.has(model)) {
    return c.json({ error: `Model not allowed: ${model}`, allowed: [...CHAT_MODELS] }, 400);
  }

  if (body.max_tokens && body.max_tokens > 4096) {
    return c.json({ error: "Max 4096 tokens per request" }, 400);
  }

  // Quota check
  const usage = c.get("usageTotals");
  const quota = c.get("usageQuota");
  if ((usage?.purposeRequests ?? 0) >= quota.purposeRequests) {
    return c.json({ error: "Quota exceeded: purpose requests", limit: quota.purposeRequests }, 429);
  }

  const upstream = await proxyOpenRouter(c.env.OPENROUTER_API_KEY, {
    model,
    messages: body.messages,
    max_tokens: Math.min(body.max_tokens ?? 2048, 4096),
  });

  const today = new Date().toISOString().slice(0, 10);
  c.executionCtx.waitUntil(usageQueries.sync(db, userId, today, { purposeRequests: 1 }));

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
});

export { proxy as proxyRoutes };
