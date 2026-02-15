No - `reposIndexed` is a usage counter, not a limit. The limit is `maxRepos`.

Let me summarize my findings:

## Report

- **Tool calls**: 22
- **Files read**: 12
- **Key findings**:
  1. **Quota check location**: `apps/daemon/src/server.ts:228-241` — checks `listRepos(db).length >= quotaCache?.quota?.maxRepos` before allowing repo registration
  2. **Inconsistent fallback values**: Cloud code (`usage.ts:50`) hardcodes `maxRepos: 3` as fallback, daemon code (`server.ts:229`) uses `?? 50`, but DB `plan_quotas` table has `free.max_repos = 19` and `pro.max_repos = 50`
  3. **Quota cache flow**: Daemon fetches from `/api/usage/current` → stores in `quotaCache` with 5-min TTL → on fetch failure sets `quota: {}` which falls back to 50 repos. The only way to get `maxRepos: 3` is if cloud's `quotaQueries.getByPlan()` returns `null` (missing row in `plan_quotas`), which doesn't match current DB state (both "free" and "pro" rows exist)
