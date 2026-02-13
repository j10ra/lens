import { createMiddleware } from "hono/factory";
import type { Env } from "../env";

interface TokenBucket {
  tokens: number;
  last: number;
}

const MAX_TOKENS = 60;
const REFILL_RATE = 1; // tokens per second

export const rateLimit = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const userId = c.get("userId");
  const kvKey = `rl:${userId}`;
  const now = Date.now();

  const raw = await c.env.RATE_LIMIT.get(kvKey);
  const bucket: TokenBucket = raw ? JSON.parse(raw) : { tokens: MAX_TOKENS, last: now };

  const elapsed = (now - bucket.last) / 1000;
  bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + elapsed * REFILL_RATE);
  bucket.last = now;

  if (bucket.tokens < 1) {
    c.header("Retry-After", String(Math.ceil(1 / REFILL_RATE)));
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  bucket.tokens -= 1;

  c.executionCtx.waitUntil(
    c.env.RATE_LIMIT.put(kvKey, JSON.stringify(bucket), {
      expirationTtl: 120,
    }),
  );

  await next();
});
