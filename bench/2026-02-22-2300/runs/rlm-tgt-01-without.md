Boss, here's the complete picture:

## Port Configuration Analysis

The daemon port `4111` is **hardcoded in 5 locations** with no environment variable override:

| Location | Line | Code |
|----------|------|------|
| `apps/daemon/src/http.ts` | 96 | `const PORT = 4111;` |
| `apps/daemon/src/mcp.ts` | 7 | `const API = "http://localhost:4111/api/mcp";` |
| `packages/cli/src/lib/daemon.ts` | 1 | `const BASE = "http://localhost:4111";` |
| `apps/dashboard/src/lib/api.ts` | 1 | `const API = "http://localhost:4111/api/dashboard";` |
| `apps/dashboard/src/components/explore/CommandPalette.tsx` | 21 | `const API = "http://localhost:4111/api/dashboard";` |

### Existing Env Vars (not port-related)

From `apps/daemon/src/index.ts:8` and `http.ts:24`:
- `LENS_DATA_DIR` — data directory for `traces.db` and `index.db` (default: `~/.lens`)
- `LENS_DASHBOARD_DIST` — override dashboard static files path

### Current State

**Port is NOT configurable.** To make it configurable, you'd need to:

1. Add `LENS_PORT` env var in `http.ts:96`
2. Propagate to all client modules (CLI, MCP, dashboard) — or use a shared config module

---

## Report

- **Tool calls**: 6
- **Tools used**: ToolSearch, Grep, Glob, Read
- **Files read**: 5
- **Files used**: apps/daemon/src/http.ts, apps/daemon/src/mcp.ts, apps/daemon/src/index.ts, packages/cli/src/lib/daemon.ts, apps/dashboard/src/lib/api.ts
- **Key findings**:
  - Port 4111 hardcoded in 5 separate modules — no single source of truth
  - No `LENS_PORT` or similar env var exists for port configuration
  - Other env vars (`LENS_DATA_DIR`, `LENS_DASHBOARD_DIST`) show the pattern for adding one
  - Dashboard has a duplicate hardcoded URL in CommandPalette.tsx (potential drift risk)
