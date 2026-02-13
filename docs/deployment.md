# Deployment Guide

Three deployment targets: **npm package** (CLI + daemon), **Railway** (cloud API + admin), **Cloudflare Pages** (marketing site).

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
pnpm -w release          # interactive: bump version, build, publish, commit + tag
git push && git push --tags
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

## 2. Railway (`lens-cloud`)

The cloud API handles auth, API keys, usage metering, billing (Stripe), and AI proxy (Voyage + OpenRouter). Admin panel is TanStack Start SSR.

Deployed on Railway — auto-deploys from `main` branch. No wrangler/CF Workers.

### Environment Variables

Set in Railway dashboard (project → service → Variables):

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

### Custom Domain

Configure in Railway dashboard → service → Settings → Custom Domain → `cloud.lens-engine.com`.

### Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://cloud.lens-engine.com/api/billing/webhooks/stripe`
3. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
4. Copy signing secret → set as `STRIPE_WEBHOOK_SECRET` in Railway

### Verify

```bash
curl https://cloud.lens-engine.com/api/health
curl -I https://cloud.lens-engine.com/auth/callback
curl https://cloud.lens-engine.com/dashboard
```

---

## 3. Cloudflare Pages (`lens-web`)

Static marketing site (TanStack Start, static output). Deployed on Cloudflare Pages.

### Deploy

Auto-deploys from `main` branch via Cloudflare Pages git integration, or manual:

```bash
cd apps/web
pnpm build
# Output in .output/public/
```

### Custom Domain

`lens-engine.com` — configured in Cloudflare Pages dashboard.

---

## 4. Supabase Database

Running at `kuvsaycpvbbmyyxiklap` (ap-northeast-2). Tables managed by Drizzle migrations.

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

## 5. Daemon Config (`~/.lens/config.json`)

| Key | Default | Purpose |
|-----|---------|---------|
| `cloud_url` | `https://cloud.lens-engine.com` | Cloud API base URL |
| `telemetry` | `true` | Enable anonymous telemetry |
| `telemetry_id` | auto-generated UUID | Installation identifier |

Override cloud URL: `LENS_CLOUD_URL=http://localhost:3001 lens start`

---

## Checklist

### npm Package
- [ ] `pnpm -w build:publish` succeeds
- [ ] `cd publish && npm pack` → inspect tarball contents
- [ ] `npm install -g .` → `lens --version` works
- [ ] `lens start` → daemon starts on :4111
- [ ] `lens repo register` → indexes current repo
- [ ] `lens context "test"` → returns context pack

### Railway (Cloud)
- [ ] All env vars set in Railway dashboard
- [ ] Auto-deploy from main working
- [ ] `curl /api/health` returns 200
- [ ] Stripe webhook endpoint added + verified
- [ ] Custom domain configured + DNS propagated
- [ ] Admin panel loads at `/dashboard`

### Cloudflare Pages (Web)
- [ ] Pages project connected to repo
- [ ] Build command + output dir configured
- [ ] Custom domain configured
- [ ] Site loads at `lens-engine.com`
