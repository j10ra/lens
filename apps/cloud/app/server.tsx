import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import api from "../src/api";
import type { Env, KVStore } from "../src/env";

/** Map-based KV stub for Node.js (CF Workers compat) */
function createKVStub(): KVStore {
  const store = new Map<string, { value: string; expireAt?: number }>();

  return {
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expireAt && Date.now() > entry.expireAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, {
        value,
        expireAt: opts?.expirationTtl
          ? Date.now() + opts.expirationTtl * 1000
          : undefined,
      });
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

function buildEnv(): Env {
  const e = process.env;
  return {
    DATABASE_URL: e.DATABASE_URL ?? "",
    SUPABASE_URL: e.SUPABASE_URL ?? "",
    SUPABASE_SERVICE_KEY: e.SUPABASE_SERVICE_KEY ?? "",
    STRIPE_SECRET_KEY: e.STRIPE_SECRET_KEY ?? "",
    STRIPE_WEBHOOK_SECRET: e.STRIPE_WEBHOOK_SECRET ?? "",
    STRIPE_PRICE_MONTHLY: e.STRIPE_PRICE_MONTHLY ?? "",
    STRIPE_PRICE_YEARLY: e.STRIPE_PRICE_YEARLY ?? "",
    VOYAGE_API_KEY: e.VOYAGE_API_KEY ?? "",
    OPENROUTER_API_KEY: e.OPENROUTER_API_KEY ?? "",
    SENTRY_DSN: e.SENTRY_DSN ?? "",
    ENVIRONMENT: e.ENVIRONMENT ?? "development",
    RATE_LIMIT: createKVStub(),
  };
}

const executionCtx = {
  waitUntil: (p: Promise<unknown>) => {
    p.catch(() => {});
  },
  passThroughOnException: () => {},
};

const handler = createStartHandler(({ request, router, responseHeaders }) => {
  const url = new URL(request.url);

  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname === "/health"
  ) {
    return api.fetch(request, buildEnv(), executionCtx as any);
  }

  return defaultStreamHandler({ request, router, responseHeaders });
});

export default { fetch: handler };
