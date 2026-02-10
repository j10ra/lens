export interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  DATABASE_URL: string;
  APP_URL: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_MONTHLY: string;
  STRIPE_PRICE_YEARLY: string;
  VOYAGE_API_KEY: string;
  OPENROUTER_API_KEY: string;
  SENTRY_DSN: string;
  RATE_LIMIT: KVStore;
  ENVIRONMENT: string;
}
