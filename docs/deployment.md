# Deployment Guide

Two deployment targets: **npm package** (CLI + daemon) and **Cloudflare Workers** (cloud API + admin panel).

---

## 1. npm Package (`lens-engine`)

The CLI and daemon ship as a single npm package. One `tsup` build bundles everything — only `better-sqlite3` remains external (native addon compiled on install).

### Build

```bash
pnpm -w build:publish
```

This runs:
1. `pnpm -r build` — builds all workspace packages
2. `tsup --config tsup.config.publish.ts` — bundles `cli.js` + `daemon.js` (ESM, Node 20+)
3. Copies dashboard SPA into `publish/dashboard/`
4. Copies `publish.json` → `publish/package.json`
5. `npm install --omit=dev` in `publish/` — installs only `better-sqlite3`

Output structure:
```
publish/
  cli.js          ← lens command (shebang: #!/usr/bin/env node)
  daemon.js       ← lens-daemon (HTTP :4111 + MCP stdio)
  dashboard/      ← React SPA (served at /dashboard/)
  package.json    ← publish manifest
  node_modules/   ← better-sqlite3 only
```

### Local Test

```bash
pnpm -w deploy:local
```

Equivalent to `build:publish` + `npm install -g .` + `lens daemon stop` + `lens daemon start`.

### Publish to npm

```bash
cd publish
npm publish
```

Package name: `lens-engine`, binaries: `lens` + `lens-daemon`.

### What Users Do

```bash
npm install -g lens-engine    # or: npx lens-engine
lens start                    # start daemon on :4111
lens repo register            # index current repo
lens context "my goal"        # get context pack
lens init                     # write .mcp.json for Claude Code
lens login                    # unlock Pro features
```

### Requirements

- Node.js >= 20 (for `better-sqlite3` native addon)
- ~30 MB disk (binary + SQLite DB grows with repos)

---

## 2. Cloudflare Workers (`lens-cloud`)

The cloud API handles auth, API keys, usage metering, billing (Stripe), and AI proxy (Voyage + OpenRouter). Admin panel is TanStack Start SSR.

### Prerequisites

```bash
npm install -g wrangler
wrangler login
```

### Step 1: Create KV Namespace

Rate limiting uses Cloudflare KV.

```bash
# Production
wrangler kv namespace create RATE_LIMIT
# Copy the id from output

# Preview (for staging)
wrangler kv namespace create RATE_LIMIT --preview
```

Update `apps/cloud/wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "<paste production id>"
preview_id = "<paste preview id>"
```

### Step 2: Set Secrets

Seven secrets required:

```bash
cd apps/cloud

# Supabase (from project settings → API)
wrangler secret put SUPABASE_URL          # https://kuvsaycpvbbmyyxiklap.supabase.co
wrangler secret put SUPABASE_SERVICE_KEY  # service_role key (NOT anon)

# Stripe (from Stripe Dashboard → Developers → API keys)
wrangler secret put STRIPE_SECRET_KEY       # sk_live_...
wrangler secret put STRIPE_WEBHOOK_SECRET   # whsec_... (from webhook endpoint)

# AI Providers
wrangler secret put VOYAGE_API_KEY       # Voyage AI dashboard
wrangler secret put OPENROUTER_API_KEY   # OpenRouter dashboard

# Monitoring
wrangler secret put SENTRY_DSN           # Sentry project DSN
```

### Step 3: Set Environment Variables

Update `wrangler.toml` vars section:
```toml
[vars]
ENVIRONMENT = "production"
DATABASE_URL = "postgresql://postgres.kuvsaycpvbbmyyxiklap:PASSWORD@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres"
STRIPE_PRICE_MONTHLY = "price_..."
STRIPE_PRICE_YEARLY = "price_..."
VITE_ADMIN_EMAILS = "admin@example.com"
```

### Step 4: Deploy

```bash
cd apps/cloud
pnpm build              # vite build → .output/
wrangler deploy          # deploys to CF Workers
```

### Step 5: Custom Domain

```bash
wrangler domains add cloud.lens-engine.com
```

Or configure in Cloudflare Dashboard → Workers → lens-cloud → Custom Domains.

### Step 6: Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://cloud.lens-engine.com/api/billing/webhooks/stripe`
3. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
4. Copy signing secret → `wrangler secret put STRIPE_WEBHOOK_SECRET`

### Step 7: Verify

```bash
# Health check
curl https://cloud.lens-engine.com/api/health

# Auth callback (should redirect)
curl -I https://cloud.lens-engine.com/auth/callback

# Admin panel (should render login)
curl https://cloud.lens-engine.com/dashboard
```

---

## 3. Supabase Database

Already running at `kuvsaycpvbbmyyxiklap` (ap-northeast-2). Tables managed by Drizzle migrations.

### Tables

| Table | Purpose |
|-------|---------|
| `plan_quotas` | Per-plan limits (max_repos, embedding_chunks, etc.) |
| `api_keys` | API key store (SHA-256 hashed, prefix-indexed) |
| `subscriptions` | Stripe subscription state per user |
| `usage_daily` | Daily usage counters per user |
| `telemetry_events` | Anonymous telemetry from daemon instances |

### Push Migrations

```bash
cd packages/cloud-db
npx drizzle-kit push
```

### RLS

All tables have Row-Level Security enabled. `api_keys`, `subscriptions`, and `usage_daily` are user-scoped. `plan_quotas` is read-only for authenticated users. `telemetry_events` is insert-only (no auth required).

---

## 4. Environment Variables Reference

### Cloud (`apps/cloud/.env`)

| Variable | Source | Required |
|----------|--------|----------|
| `DATABASE_URL` | Supabase connection pooler | Yes |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key | Yes |
| `STRIPE_SECRET_KEY` | Stripe API key | Yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | Yes |
| `STRIPE_PRICE_MONTHLY` | Stripe price ID (monthly) | Yes |
| `STRIPE_PRICE_YEARLY` | Stripe price ID (yearly) | Yes |
| `VOYAGE_API_KEY` | Voyage AI API key | Yes |
| `OPENROUTER_API_KEY` | OpenRouter API key | Yes |
| `SENTRY_DSN` | Sentry project DSN | No |
| `VITE_SUPABASE_URL` | Supabase URL (client-side) | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (client-side) | Yes |
| `VITE_ADMIN_EMAILS` | Comma-separated admin emails | Yes |
| `VITE_SENTRY_DSN` | Sentry DSN (client-side) | No |

### Daemon (`~/.lens/config.json`)

| Key | Default | Purpose |
|-----|---------|---------|
| `cloud_url` | `https://cloud.lens-engine.com` | Cloud API base URL |
| `telemetry` | `true` | Enable anonymous telemetry |
| `telemetry_id` | auto-generated UUID | Installation identifier |

Override cloud URL: `LENS_CLOUD_URL=http://localhost:3001 lens start`

---

## 5. CI/CD (GitHub Actions)

### npm Publish Workflow

```yaml
name: Publish npm
on:
  release:
    types: [published]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
      - run: pnpm install
      - run: pnpm -w build:publish
      - run: cd publish && npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### CF Workers Deploy Workflow

```yaml
name: Deploy Cloud
on:
  push:
    branches: [main]
    paths: [apps/cloud/**, packages/cloud-db/**]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: pnpm install
      - run: pnpm --filter @lens/cloud-db build
      - run: pnpm --filter @lens/cloud build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          workingDirectory: apps/cloud
```

---

## Checklist

### npm Package
- [ ] `pnpm -w build:publish` succeeds
- [ ] `cd publish && npm pack` → inspect tarball contents
- [ ] `npm install -g .` → `lens --version` works
- [ ] `lens start` → daemon starts on :4111
- [ ] `lens repo register` → indexes current repo
- [ ] `lens context "test"` → returns context pack

### Cloudflare Workers
- [ ] KV namespace created, ID in wrangler.toml
- [ ] All 7 secrets set via `wrangler secret put`
- [ ] `wrangler deploy` succeeds
- [ ] `curl /api/health` returns 200
- [ ] Stripe webhook endpoint added + verified
- [ ] Custom domain configured + DNS propagated
- [ ] Admin panel loads at `/dashboard`
