import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { Env } from "../env";
import { getDb } from "../lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EVENTS = 500;
const VALID_TYPES = new Set(["install", "index", "context", "error", "command"]);

export const telemetryRoutes = new Hono<{ Bindings: Env }>();

telemetryRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "invalid body" }, 400);

  const { telemetry_id, events } = body as {
    telemetry_id?: string;
    events?: Array<{ event_type: string; event_data?: unknown; created_at?: string }>;
  };

  if (!telemetry_id || !UUID_RE.test(telemetry_id)) {
    return c.json({ error: "valid telemetry_id required" }, 400);
  }
  if (!Array.isArray(events) || events.length === 0) {
    return c.json({ error: "events array required" }, 400);
  }
  if (events.length > MAX_EVENTS) {
    return c.json({ error: `max ${MAX_EVENTS} events per request` }, 400);
  }

  // Rate limit: 100 req/hr per telemetry_id
  const kvKey = `trl:${telemetry_id}`;
  const raw = await c.env.RATE_LIMIT.get(kvKey);
  const count = raw ? Number.parseInt(raw, 10) : 0;
  if (count >= 100) {
    return c.json({ error: "rate limit exceeded" }, 429);
  }
  c.executionCtx.waitUntil(
    c.env.RATE_LIMIT.put(kvKey, String(count + 1), { expirationTtl: 3600 }),
  );

  const db = getDb(c.env.DATABASE_URL);
  const now = new Date().toISOString();

  const valid = events.filter((e) => e.event_type && VALID_TYPES.has(e.event_type));
  if (valid.length === 0) {
    return c.json({ ok: true, inserted: 0 });
  }

  // Insert one at a time with parameterized queries for safety
  for (const e of valid) {
    await db.execute(sql`
      INSERT INTO telemetry_events (id, telemetry_id, event_type, event_data, created_at, received_at)
      VALUES (
        gen_random_uuid(),
        ${telemetry_id}::uuid,
        ${e.event_type},
        ${e.event_data ? JSON.stringify(e.event_data) : null}::jsonb,
        ${e.created_at || now}::timestamptz,
        ${now}::timestamptz
      )
    `);
  }

  return c.json({ ok: true, inserted: valid.length });
});
