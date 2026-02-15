The query returns ALL repos, no filtering.

## Summary of Quota Check Logic

**Flow:**
1. **Daemon startup** (`index.ts`):
   - `loadCapabilities()` → `fetch(cloudUrl/api/usage/current)`
   - Cloud returns `{ plan, usage, quota: { maxRepos, ... } }`
   - Passed to `createApp()` as `initialPlanData`
   - Seeds `quotaCache`

2. **Periodic refresh** (`server.ts`):
   - Every 5 minutes: `refreshQuotaCache()` → `cloudProxy(GET, /api/usage/current)`
   - Updates `quotaCache`
   - On failure: `quotaCache = { plan: "free", usage: {}, quota: {} }`

3. **Repo registration** (`server.ts:220-241`):
   - `currentRepos = listRepos(db).length` — counts ALL repos in local SQLite
   - `maxRepos = quotaCache?.quota?.maxRepos ?? 50`
   - If `currentRepos >= maxRepos` → 429

**Cloud API** (`apps/cloud/src/routes/usage.ts`):
- `quotaRow = quotaQueries.getByPlan(db, plan)` — looks up `plan_quotas` table
- If `quotaRow` is null → fallback to `{ maxRepos: 3, ... }`
- DB has `free.max_repos = 19`, `pro.max_repos = 50`

**Possible bug causes:**
1. **User without subscription** → defaults to "free" → `maxRepos = 19` (DB has 19, not 3)
2. **Cloud fetch failure** → `quota = {}` → `maxRepos = 50` (fallback at line 229)
3. **`quotaRow` null somehow** → `maxRepos = 3` (hardcoded fallback at usage.ts:50)

The only way to get `maxRepos = 3` is if `quotaQueries.getByPlan(db, "free")` returns null. This could happen if:
- The `plan_quotas` table has no "free" row
- There's a case sensitivity issue (`"Free"` vs `"free"`)
- There's a race condition where the row doesn't exist yet

**But the DB shows `free` exists with `max_repos = 19`.**

The bug requires more information — specifically the actual `current`, `limit`, and `plan` values from the 429 response.

## Report

- **Tool calls**: 22
- **Files read**: 10
- **Key findings**:
  - Quota check flow: daemon caches cloud `/api/usage/current` response → uses `quotaCache.quota.maxRepos` at registration
  - Cloud returns `quota.maxRepos` from `plan_quotas` table (free=19, pro=50) — **NOT 3**
  - Hardcoded fallback `maxRepos: 3` in `apps/cloud/src/routes/usage.ts:50` only applies if `quotaRow` is null
  - DB confirms `free` plan has `max_repos = 19`, so fallback should never trigger for "free" plan
  - User `4ab6a88c-cd41-41df-ad91-c1050256d551` has API key but no subscription → defaults to "free"
  - **Cannot reproduce bug with current code** — need actual `current`/`limit`/`plan` values from 429 response to diagnose further
  - Possible hidden cause: case sensitivity in plan name, or `listRepos()` returning unexpected count
