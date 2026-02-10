# Architecture

LENS is a local-first repo context engine that indexes codebases and serves context packs to AI agents. Three layers: engine (SQLite), daemon (HTTP + MCP), cloud (API + admin).

```
┌─────────────────────────────────────────────────────┐
│  AI Agent (Claude Code, Cursor, etc.)               │
│  ← MCP stdio or HTTP GET /context                   │
└─────────────────┬───────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────┐
│  Layer 2: Daemon  (Hono, :4111)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ REST API │ │ MCP svr  │ │Dashboard │            │
│  └────┬─────┘ └────┬─────┘ └──────────┘            │
│       │             │                                │
│  ┌────▼─────────────▼──────┐  ┌────────────────┐   │
│  │  Layer 1: Engine        │  │ Cloud Proxy    │   │
│  │  SQLite (better-sqlite3)│  │ (authenticated)│   │
│  └─────────────────────────┘  └───────┬────────┘   │
└───────────────────────────────────────┼─────────────┘
                                        │
┌───────────────────────────────────────▼─────────────┐
│  Layer 3: Cloud  (Hono API + TanStack Start SSR)    │
│  ┌──────┐ ┌──────┐ ┌───────┐ ┌────────┐ ┌──────┐  │
│  │ Auth │ │ Keys │ │ Usage │ │ Proxy  │ │Stripe│  │
│  └──────┘ └──────┘ └───────┘ └───┬────┘ └──────┘  │
│                                   │                  │
│                          ┌────────▼────────┐        │
│                          │ Voyage  OpenRtr  │        │
│                          └─────────────────┘        │
└───────────────────────────────┬─────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │  Supabase (Postgres)  │
                    │  Auth + RLS           │
                    └───────────────────────┘
```

---

## Layer 1: Engine (`packages/engine`)

Core indexing and retrieval. Pure TypeScript, SQLite via better-sqlite3 + Drizzle ORM. Zero network dependencies.

### SQLite Tables

| Table | Purpose |
|-------|---------|
| `repos` | Registered repositories (path, name, index state, vocab clusters) |
| `chunks` | Code chunks with content hash, language, embedding vector |
| `file_metadata` | Exports, imports, docstrings per file |
| `file_imports` | Directed import graph edges |
| `file_stats` | Per-file git statistics |
| `file_cochanges` | Co-change pairs (files modified together in commits) |
| `usage_counters` | Local daily counters (context queries, repos indexed) |
| `request_logs` | HTTP request log (method, path, status, duration, source) |
| `telemetry_events` | Buffered telemetry events (synced to cloud periodically) |

### Indexing Pipeline

`runIndex(db, repoId, caps?, force?)` in `packages/engine/src/index/engine.ts`:

```
1. Diff scan (or full scan if force/first run)
   └→ Git diff between last_indexed_commit and HEAD
2. Chunk files (language-aware splitting, ~200 line chunks)
   └→ Respects MAX_CHUNKS_PER_REPO (100,000)
3. extractAndPersistMetadata()
   └→ Exports, imports, docstrings from AST-like heuristics
4. buildVocabClusters() [Pro only]
   └→ Voyage-embed unique terms, cosine cluster > 0.75
5. buildAndPersistImportGraph()
   └→ Directed edges from import/require statements
6. computeMaxImportDepth()
   └→ BFS from leaf nodes in import graph
7. analyzeGitHistory()
   └→ Commit counts per file, co-change pair extraction
```

After `runIndex` completes, two background tasks run (Pro only):
- `ensureEmbedded()` — Voyage vector embeddings for code chunks
- `enrichPurpose()` — LLM-generated 1-sentence summaries per file

Both check quota remaining before starting (see [Quota Enforcement](#quota-enforcement)).

### Context Pack Pipeline

`buildContext(db, repoId, goal, caps?)` — the core retrieval function.

```
1. Auto-index (diff scan if HEAD changed since last index)
2. Query interpretation
   └→ Extract keywords from goal text
3. TF-IDF scoring
   └→ Code-domain stopwords, path tokens, exports, docstrings
4. Concept expansion
   └→ Static synonyms + vocab clusters (Pro)
5. Co-change promotion
   └→ Boost files that co-change with top-ranked files
6. Semantic boost [Pro only]
   └→ Voyage vector search: embed goal → cosine similarity
   └→ Adds ~100-300ms latency
7. Structural enrichment
   └→ Import graph (2-hop dependencies)
   └→ Co-change clusters
   └→ Git activity scores
8. Cache (120s TTL, 20 entries per repo)
```

Response: ~10ms cached, ~0.5-7s cold (depending on repo size and Pro features).

### Scoring Formula

| Factor | Weight | Description |
|--------|--------|-------------|
| Filename token | 4x * IDF | camelCase/snake_case split |
| Directory token | 2x * IDF | Last 3 path segments |
| Export match | 2x * IDF | Exported symbols |
| Docstring/purpose | 1x * IDF | OR logic, no double-count |
| Coverage boost | *(1 + (matched/total)^2) | Multi-term matches favored |
| Noise penalty | *0.3 | vendor/, .min.js, etc. |
| Activity boost | +min(recent, 5) * 0.5 | Recent commits (90d) |
| Cluster boost | *1.3 | Vocab cluster match |
| Indegree boost | *(1 + log2(deg) * 0.1) | Files imported by 3+ |

Post-scoring: sibling dedup (max 2/group) → dynamic cap (8-15 based on import depth) → co-change promotion (up to 3) → semantic merge (up to 5 replacements).

---

## Layer 2: Daemon (`apps/daemon`)

Hono HTTP server on `:4111`. Dual transport: HTTP for CLI/dashboard, stdio for MCP.

### Entry Point

`apps/daemon/src/index.ts`:
1. Opens SQLite DB (`~/.lens/data.db`)
2. Loads capabilities (checks `~/.lens/auth.json` → creates cloud capabilities if Pro)
3. Creates Hono app (`createApp(db, dashboardDist, caps)`)
4. If `--stdio` flag: starts MCP stdio server
5. Otherwise: starts HTTP on `:4111`, writes PID file

### Route Groups

| Prefix | Purpose |
|--------|---------|
| `/health` | Health check |
| `/repo/*` | Repo CRUD, status, indexing |
| `/context` | Context pack retrieval |
| `/index/*` | Trigger index, watch/unwatch |
| `/daemon/*` | Stats, version |
| `/api/auth/*` | Auth status, SSE events |
| `/api/cloud/*` | Proxy to cloud API |
| `/api/dashboard/*` | Dashboard-specific endpoints |
| `/dashboard/*` | Static SPA files |
| `/telemetry/*` | Telemetry event ingestion |

### Request Logging

Every request (except dashboard static files and `/health`) is logged to SQLite:

```
logQueries.insert(db, method, path, status, duration_ms, source)
```

Source derived from: path prefix (`/api/dashboard/` → "dashboard"), User-Agent (`lens-cli` → "cli", `mcp` → "mcp"), default → "api".

Logs pruned hourly (7-day retention).

### File Watchers

`chokidar` watches registered repo directories. On change → marks repo as stale. Re-index triggered on next `/context` request or explicit `/index/run/:id`.

### SSE Event Buses

Two independent SSE streams:
- `/api/repo/events` — emits `repo-changed` on register/remove/index/watch
- `/api/auth/events` — emits `auth-changed` when `~/.lens/auth.json` changes (via `fs.watch`)

Dashboard subscribes to both for real-time updates.

### Background Timers

| Timer | Interval | Purpose |
|-------|----------|---------|
| Quota cache refresh | 5 min | `GET /api/usage/current` via cloud proxy |
| Telemetry sync | 60s | POST buffered events to cloud |
| Log prune | 1 hr | Delete request logs older than 7 days |

---

## Authentication

### Login Flow

```
1. User: lens login
2. CLI opens browser → https://lens.dev/auth/login?device_code=<uuid>
3. User authenticates via Supabase (GitHub OAuth, Google, or magic link)
4. Cloud callback: /auth/callback
   a. Upserts Supabase user
   b. Creates default API key (lk_live_ prefix, SHA-256 hashed)
   c. Redirects with tokens
5. CLI writes ~/.lens/auth.json:
   {
     access_token, refresh_token, user_email,
     user_id, expires_at, api_key: "lk_live_..."
   }
6. Daemon detects auth.json change → SSE push to dashboard
```

### API Key Provisioning

If `auth.json` has `access_token` but no `api_key`, daemon auto-provisions via `GET /auth/key`. Key persisted back to `auth.json`.

### API Key Validation (Cloud)

`apps/cloud/src/middleware/auth.ts`:

1. Extract Bearer token from Authorization header
2. Validate prefix: must start with `lk_`
3. 12-char prefix → lookup in `api_keys` table
4. Check: not revoked, not expired
5. SHA-256 hash → constant-time compare with stored hash
6. Set `userId` and `apiKeyId` for downstream handlers
7. Touch `last_used_at` (non-blocking via `waitUntil`)

### Token Refresh

Daemon auto-refreshes expired Supabase JWTs via `/auth/v1/token?grant_type=refresh_token`. Updated tokens written to `auth.json`.

---

## Capabilities Lifecycle (Pro Features)

"Capabilities" = `embedTexts()` + `generatePurpose()`. Only available to Pro subscribers.

### Loading (Daemon Startup)

```
1. Read ~/.lens/auth.json
2. Ensure API key exists (auto-provision if needed)
3. Verify plan: GET /api/usage/current → check plan === "pro"
4. If pro: return createCloudCapabilities(apiKey)
5. If free/error: return undefined
```

### Cloud Capabilities Factory

`apps/daemon/src/cloud-capabilities.ts`:

**`embedTexts(texts, isQuery?)`**
- `POST ${cloudUrl}/api/proxy/embed`
- Body: `{ input: texts, model: "voyage-code-3", input_type: "query"|"document" }`
- Returns: `number[][]` (embedding vectors)

**`generatePurpose(path, content, exports, docstring)`**
- `POST ${cloudUrl}/api/proxy/chat`
- Body: OpenAI-compatible chat completion (system + user prompt)
- Model: `qwen/qwen3-coder-next` via OpenRouter
- Returns: 1-sentence purpose summary

### Cloud URL Resolution

Priority: `LENS_CLOUD_URL` env → `~/.lens/config.json` → `DEFAULT_CLOUD_URL` (`https://lens.dev`).

Single source of truth: `apps/daemon/src/config.ts`.

### Free vs Pro

| Feature | Free | Pro |
|---------|------|-----|
| TF-IDF indexing | Yes | Yes |
| Import graph | Yes | Yes |
| Co-change analysis | Yes | Yes |
| Git history | Yes | Yes |
| Context packs | Yes | Yes |
| Vocab clusters | No | Yes |
| Voyage embeddings | No | Yes |
| Purpose summaries | No | Yes |
| Semantic search boost | No | Yes |

CLI shows Pro features as locked when `has_capabilities === false`.

---

## Request Tracking

### Local (Daemon SQLite)

Every API call → `request_logs`:

| Column | Value |
|--------|-------|
| `method` | HTTP method |
| `path` | URL path |
| `status` | Response status code |
| `duration_ms` | Response time |
| `source` | "cli", "mcp", "dashboard", "api" |
| `created_at` | Timestamp |

Pruned hourly (7-day retention). Dashboard shows filterable table.

### Cloud (Supabase `usage_daily`)

Daily aggregated counters per user:

| Counter | What it tracks |
|---------|---------------|
| `context_queries` | Context pack requests |
| `embedding_requests` | Voyage API calls |
| `embedding_chunks` | Text chunks embedded |
| `purpose_requests` | OpenRouter completions |
| `repos_indexed` | Index operations |

Incremented in cloud proxy routes via `usageQueries.sync()` (upsert on `user_id + date`).

---

## Quota Enforcement

### Plan Quotas Table

`plan_quotas` in Supabase (editable via admin Rates page):

| Column | Type | Free | Pro |
|--------|------|------|-----|
| `max_repos` | integer | 3 | 50 |
| `context_queries` | integer | 0 | 10,000 |
| `embedding_requests` | integer | 0 | 5,000 |
| `embedding_chunks` | integer | 0 | 500,000 |
| `purpose_requests` | integer | 0 | 5,000 |
| `repos_indexed` | integer | 0 | 1,000 |

### Cloud-Side Enforcement

**Quota middleware** (`apps/cloud/src/middleware/quota.ts`):
1. Get subscription → determine plan
2. Period start from subscription dates
3. Parallel fetch: current period usage + plan quotas
4. Set `usageTotals` + `usageQuota` on context
5. Downstream routes: `usage[key] >= quota[key]` → 429

**Proxy enforcement** (`apps/cloud/src/routes/proxy.ts`):
- `/api/proxy/embed`: checks `embeddingRequests` + `embeddingChunks`
- `/api/proxy/chat`: checks `purposeRequests`
- Both require Pro plan (`requirePro()` → 403 if free)

### Daemon-Side Enforcement

**Quota cache** (5-min TTL, in-memory):
```
Daemon → GET /api/usage/current → { plan, usage, quota }
```

**Pre-flight checks** (after indexing, before Pro features):
```
if quotaRemaining("embeddingChunks") > 0 → run embeddings
if quotaRemaining("purposeRequests") > 0 → run purpose summaries
Otherwise → skip with log message
```

**Registration limit** (`POST /repo/register`):
```
currentRepos >= quotaCache.quota.maxRepos → 429
```

**Graceful degradation**: When cloud unreachable, `quotaCache = null`, all limits return Infinity (no enforcement). Requests will fail at cloud proxy level if quota is actually exceeded.

---

## Rate Limiting

Token bucket in Cloudflare KV (`apps/cloud/src/middleware/rate-limit.ts`):

```
Capacity: 60 tokens
Refill: 1 token/second
Key: rl:{userId}
TTL: 120s
```

Applied to all API-key-authenticated routes. Returns 429 + `Retry-After` header.

Telemetry: separate limit, 100 req/hr per `telemetry_id` (no auth required).

---

## Telemetry

Anonymous, opt-out. No PII, no repo paths, no code.

### Event Types

| Type | When | Data |
|------|------|------|
| `install` | First daemon start | os, arch, node_version, lens_version |
| `index` | After indexing | files_scanned, chunks_created, duration_ms |
| `context` | After context query | goal length, result count, duration_ms |
| `command` | CLI command executed | command name |
| `error` | Unhandled error | error type, message (sanitized) |

### Pipeline

```
1. track(db, event_type, event_data)
   → Insert into local SQLite (synced_at = NULL)

2. Daemon sync timer (every 60s):
   a. Read unsynced events (limit 500)
   b. Read user_id from auth.json (if authenticated)
   c. POST /api/telemetry { telemetry_id, user_id?, events[] }
   d. On success: mark synced
   e. Prune old synced events

3. Cloud handler:
   a. Validate telemetry_id (UUID)
   b. Validate optional user_id (UUID)
   c. Rate limit: 100 req/hr per telemetry_id
   d. Filter valid event types
   e. Insert into Supabase telemetry_events
```

### Identifiers

- `telemetry_id`: Random UUID per installation (`~/.lens/config.json`)
- `user_id`: Supabase auth ID, links anonymous telemetry to accounts

### Opt Out

```bash
lens config set telemetry false
```

---

## Billing (Stripe)

### Plans

| Plan | Monthly | Yearly |
|------|---------|--------|
| Free | $0 | $0 |
| Pro | $9/mo | $90/yr (17% savings) |

### Flow

```
Dashboard → POST /api/cloud/billing/checkout { interval }
  → Daemon proxy → Cloud POST /api/billing/checkout
    → Stripe Checkout Session (allow_promotion_codes: true)
    → Returns checkout URL
  → Dashboard opens Stripe Checkout
  → Stripe redirects back to dashboard

Webhook: POST /api/billing/webhooks/stripe
  → checkout.session.completed → upsert subscription (pro/active)
  → customer.subscription.updated → update period dates
  → customer.subscription.deleted → set free/canceled
  → invoice.payment_failed → set past_due
```

Manage subscription via Stripe Customer Portal (cancel, change plan, update payment).

---

## Admin Panel

Cloud TanStack Start SSR at `/dashboard`. Admin-only (email allowlist).

### Guard

**Client**: `VITE_ADMIN_EMAILS` checked in `AuthProvider`.
**Server**: `requireAdmin(accessToken)` → JWT verify + email check → 403 on mismatch.

### Pages

| Route | Purpose |
|-------|---------|
| `/dashboard` | Overview: user count, revenue, events |
| `/dashboard/users` | Supabase Auth admin: all users |
| `/dashboard/usage` | Aggregated usage (all users) |
| `/dashboard/rates` | Editable plan_quotas (auto-save) |
| `/dashboard/billing` | All subscriptions |
| `/dashboard/telemetry` | Event stream + per-user breakdown |

All pages use TanStack Start server functions (`createServerFn`) calling Supabase admin APIs or Drizzle directly.

---

## MCP Integration

### Transport

Stdio (JSON-RPC) via `lens-daemon --stdio`.

### Tools

| Tool | Description |
|------|-------------|
| `get_context` | Ranked context pack for a goal |
| `list_repos` | List indexed repositories |
| `get_status` | Indexing status for a repo |
| `index_repo` | Trigger re-indexing |

### Auto-Discovery

`lens init` writes `.mcp.json`:
```json
{
  "mcpServers": {
    "lens": { "command": "lens-daemon", "args": ["--stdio"] }
  }
}
```

---

## Data Flow Summary

```
lens repo register
  → POST /repo/register (daemon)
    → registerRepo() (SQLite)
    → runIndex() → diffScan → chunk → metadata → importGraph → gitHistory
    → [Pro] ensureEmbedded() → POST /api/proxy/embed → Voyage API
    → [Pro] enrichPurpose() → POST /api/proxy/chat → OpenRouter API
    → track(db, "index", {...})

lens context "goal"
  → POST /context (daemon)
    → buildContext() → autoIndex → TF-IDF → co-change → [Pro] semantic boost
    → usageQueries.increment(db, "context_queries")
    → track(db, "context", {...})

Daemon timer (60s)
  → syncTelemetryToCloud()
    → POST /api/telemetry (cloud)
    → Insert into Supabase telemetry_events

Daemon timer (5min)
  → refreshQuotaCache()
    → GET /api/usage/current (cloud, API key auth)
    → Update in-memory quotaCache
```

## Supabase Tables (Cloud)

| Table | Purpose |
|-------|---------|
| `plan_quotas` | Per-plan quota limits (PK: plan) |
| `api_keys` | API key store (SHA-256, prefix-indexed) |
| `subscriptions` | Stripe subscription state per user |
| `usage_daily` | Daily usage counters (unique: user_id + date) |
| `telemetry_events` | Anonymous telemetry from installations |

All tables have RLS enabled. User-scoped where applicable.
