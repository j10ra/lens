-- LENS Cloud: initial schema
-- Tables: api_keys, subscriptions, usage_daily

CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"name" text DEFAULT 'default',
	"scopes" text DEFAULT '["proxy"]',
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);

--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan" text DEFAULT 'free',
	"status" text DEFAULT 'active',
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id")
);

--> statement-breakpoint
CREATE TABLE "usage_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	"date" date NOT NULL,
	"context_queries" integer DEFAULT 0,
	"embedding_requests" integer DEFAULT 0,
	"embedding_chunks" integer DEFAULT 0,
	"purpose_requests" integer DEFAULT 0,
	"repos_indexed" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "usage_daily_user_date" UNIQUE("user_id","date")
);

CREATE INDEX idx_usage_daily_user_date ON usage_daily(user_id, date);

--> statement-breakpoint
-- RLS: api_keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own keys"
  ON api_keys FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own keys"
  ON api_keys FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own keys"
  ON api_keys FOR UPDATE
  USING (user_id = auth.uid());

-- Service role bypasses RLS for API key validation in middleware

--> statement-breakpoint
-- RLS: subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- Only service role (webhooks) can insert/update subscriptions

--> statement-breakpoint
-- RLS: usage_daily
ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON usage_daily FOR SELECT
  USING (user_id = auth.uid());

-- Only service role (daemon sync) can insert/update usage
