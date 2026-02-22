## Data Storage Locations

The daemon stores all data under a single directory:

### Default Location
```
~/.lens/
```

Can be overridden via `LENS_DATA_DIR` environment variable.

### Files

| File | Purpose | Source |
|------|---------|--------|
| `traces.db` | SQLite database for request traces and logs | `apps/daemon/src/index.ts:9` |
| `index.db` | SQLite database for code index (WAL mode) | `apps/daemon/src/index.ts:10` |

### No PID File
The daemon doesn't write a PID file — it just listens on port 4111 and exits on SIGTERM/SIGINT.

### Logs
Logs go to **stderr** (never stdout, since MCP stdio monopolizes stdout). They're also persisted to `traces.db` via `TraceStore.pushLog()`.

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LENS_DATA_DIR` | `~/.lens` | Base directory for all data files |
| `LENS_DASHBOARD_DIST` | Auto-detected | Dashboard static files location |

---

## Report

- **Tool calls**: 8
- **Tools used**: ToolSearch, Grep, Glob, Read
- **Files read**: 4
- **Files used**: apps/daemon/src/index.ts, apps/daemon/src/http.ts, packages/core/src/logger.ts, packages/engine/src/db/connection.ts
- **Key findings**:
  - All data stored in `~/.lens/` (or `LENS_DATA_DIR`)
  - `traces.db` — request traces and logs (TraceStore)
  - `index.db` — code index (Engine DB, WAL mode)
  - No PID file — daemon just binds port 4111
  - Logs go to stderr + persisted to traces.db
