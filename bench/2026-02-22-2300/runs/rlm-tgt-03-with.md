I found all the data file locations. Here's the complete picture:

## Daemon Data Files

All daemon data files are stored in **`~/.lens/`** (configurable via `LENS_DATA_DIR` environment variable).

| File | Path | Purpose |
|------|------|---------|
| **traces.db** | `~/.lens/traces.db` | Trace spans & logs (TraceStore) |
| **index.db** | `~/.lens/index.db` | Code index, import graph, co-change data (Engine DB) |
| **daemon.pid** | `~/.lens/daemon.pid` | PID file for daemon process management |
| **daemon.log** | `~/.lens/daemon.log` | Daemon stdout/stderr logs |

### Key Code Locations

- **`apps/daemon/src/index.ts:8-10`** — Defines `DATA_DIR`, `TRACE_DB`, `INDEX_DB`
- **`packages/cli/src/commands/daemon.ts:9-11`** — Defines `PID_FILE`, `LOG_FILE`
- Both use `homedir()` from `node:os` to get `~`, fall back to `$HOME`

### Override

Set `LENS_DATA_DIR` environment variable to change the base directory:
```bash
LENS_DATA_DIR=/custom/path lens daemon start
```

---

## Report

- **Tool calls**: 6
- **Tools used**: ToolSearch, mcp__lens__lens_grep, Read
- **Files read**: 4
- **Files used**: apps/daemon/src/index.ts, packages/cli/src/commands/daemon.ts, packages/core/src/trace-store.ts, packages/engine/src/db/connection.ts
- **Key findings**:
  - All data stored in `~/.lens/` by default, overridable via `LENS_DATA_DIR`
  - `traces.db` — TraceStore spans/logs for observability
  - `index.db` — Engine DB for code intelligence (imports, co-change, hubs)
  - `daemon.pid` — Process management
  - `daemon.log` — Daemon stdout/stderr capture
  - Both DBs use better-sqlite3 with WAL mode for concurrent access
