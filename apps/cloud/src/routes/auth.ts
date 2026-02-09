import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { keyQueries } from "@lens/cloud-db";
import type { Env } from "../env";
import { getDb } from "../lib/db";
import { generateApiKey, hashKey } from "../lib/keys";

const auth = new Hono<{ Bindings: Env }>();

// POST /auth/login — device auth flow: generate code, store in KV
auth.post("/login", async (c) => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes)
    .map((b) => b.toString(36))
    .join("")
    .slice(0, 32);

  await c.env.RATE_LIMIT.put(`auth:${code}`, "pending", {
    expirationTtl: 300,
  });

  const loginUrl = `${c.env.SUPABASE_URL}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(`https://lens.dev/auth/callback?code=${code}`)}`;

  return c.json({ code, login_url: loginUrl });
});

// GET /auth/callback — OAuth completes, associate code with user
auth.get("/callback", async (c) => {
  const code = c.req.query("code");
  const accessToken = c.req.query("access_token");

  if (!code || !accessToken) {
    return c.json({ error: "Missing code or access_token" }, 400);
  }

  const status = await c.env.RATE_LIMIT.get(`auth:${code}`);
  if (status !== "pending") {
    return c.json({ error: "Invalid or expired code" }, 400);
  }

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return c.json({ error: "Invalid access token" }, 401);
  }

  const db = getDb(c.env.DATABASE_URL);

  // Create API key on first login
  const existingKeys = await keyQueries.listByUser(db, user.id);
  let apiKey: string | undefined;

  if (existingKeys.length === 0) {
    const { full, prefix } = generateApiKey();
    const hash = await hashKey(full);
    await keyQueries.create(db, user.id, hash, prefix, "default");
    apiKey = full;
  }

  // Store user_id + optional key against code
  const payload = JSON.stringify({ userId: user.id, apiKey });
  await c.env.RATE_LIMIT.put(`auth:${code}`, payload, {
    expirationTtl: 300,
  });

  return c.json({ ok: true, email: user.email });
});

// GET /auth/status — poll for login completion or validate existing key
auth.get("/status", async (c) => {
  const codeParam = c.req.query("code");

  // Polling mode: CLI polls with the device code
  if (codeParam) {
    const raw = await c.env.RATE_LIMIT.get(`auth:${codeParam}`);
    if (!raw || raw === "pending") {
      return c.json({ status: "pending" });
    }

    const data = JSON.parse(raw);
    await c.env.RATE_LIMIT.delete(`auth:${codeParam}`);
    return c.json({ status: "complete", ...data });
  }

  // Bearer token mode: validate API key
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer lk_")) {
    return c.json({ error: "Missing authorization" }, 401);
  }

  const fullKey = header.slice(7);
  const prefix = fullKey.slice(0, 12);
  const db = getDb(c.env.DATABASE_URL);
  const row = await keyQueries.findByPrefix(db, prefix);

  if (!row) {
    return c.json({ error: "Invalid key" }, 401);
  }

  const hash = await hashKey(fullKey);
  if (hash !== row.keyHash) {
    return c.json({ error: "Invalid key" }, 401);
  }

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data } = await supabase.auth.admin.getUserById(row.userId);

  return c.json({
    status: "authenticated",
    email: data.user?.email,
    userId: row.userId,
  });
});

export { auth as authRoutes };
