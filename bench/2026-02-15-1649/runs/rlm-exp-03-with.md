Now I have the full picture. Let me summarize the MCP integration flow.

## MCP Server Integration Flow

### 1. MCP Entry Point Registration

**File**: `packages/cli/src/util/inject-mcp.ts`

When user runs `lens mcp`, the CLI injects an MCP server entry into `.mcp.json`:

```json
{
  "mcpServers": {
    "lens": {
      "command": "npx",
      "args": ["lens-daemon", "--stdio"]
    }
  }
}
```

This enables MCP-compatible clients (like Claude) to auto-discover LENS.

### 2. Daemon Startup in MCP Mode

**File**: `apps/daemon/src/index.ts:144-163`

When `lens-daemon --stdio` is invoked:

1. Opens SQLite database (`openDb()`)
2. Loads cloud capabilities if user has Pro plan
3. Detects `--stdio` flag → enters MCP mode
4. Creates MCP server via `createMcpServer(db, caps)`
5. Connects `StdioServerTransport` for JSON-RPC over stdin/stdout
6. Registers signal handlers for graceful shutdown

### 3. MCP Tool Registration

**File**: `apps/daemon/src/mcp.ts:59-202`

`createMcpServer()` creates an `McpServer` instance and registers 4 tools:

| Tool | Description |
|------|-------------|
| `get_context` | Ranked files + co-change clusters for a goal |
| `list_repos` | List all indexed repositories |
| `get_status` | Indexing status for a repo |
| `index_repo` | Index/re-index a repository |

Each tool uses `server.registerTool(name, schema, handler)` pattern.

### 4. `get_context` Handler Flow

**File**: `apps/daemon/src/mcp.ts:69-106` → `packages/engine/src/context/context.ts:61-326`

```
MCP tool handler (get_context)
    │
    ├─► findOrRegisterRepo() — lookup or auto-register repo by path
    │
    ├─► buildContext() — core context pipeline
    │       │
    │       ├─► ensureIndexed() — diff-scan if HEAD changed
    │       │
    │       ├─► parseQuery() — detect query kind (error/debug/change/explore/target)
    │       │
    │       ├─► loadFileMetadata() — exports, imports, docstrings, sections, internals
    │       │
    │       ├─► interpretQuery() — TF-IDF scoring + concept expansion
    │       │
    │       ├─► vectorSearch() — semantic boost (Pro only, Voyage embeddings)
    │       │
    │       ├─► getCochangePartners() — git co-change promotion
    │       │
    │       ├─► resolveSnippets() — extract code sections
    │       │
    │       ├─► sliceContext() — ±10 line extraction around symbols (Phase 3)
    │       │
    │       └─► formatContextPack() — render final markdown output
    │
    ├─► logMcp() — insert into request_logs table
    │
    └─► return text(result.context_pack)
```

### 5. Response Format

The MCP tool returns a text response containing:

```markdown
# Error: <goal>

## Error Source
1. **path/to/file.ts:42** — <docstring>
   Exports: foo, bar
   ```typescript
   // relevant code snippet
   ```

## Also References
2. **path/to/other.ts** — <docstring>
...
```

### 6. Request Tracing & Logging

Every MCP call is traced and logged:

- `RequestTrace` — tracks timing of each pipeline stage
- `logMcp()` — inserts row into `request_logs` table with method, path, status, duration, request/response bodies, and serialized trace

---

## Report

- **Tool calls**: 4
- **Files read**: 4
- **Key findings**:
  - MCP integration uses `--stdio` flag to switch daemon from HTTP mode to JSON-RPC mode via `StdioServerTransport`
  - 4 MCP tools registered: `get_context`, `list_repos`, `get_status`, `index_repo`
  - `buildContext()` pipeline: index → parse → TF-IDF → semantic boost → co-change → snippets → slices → format
  - Auto-registration: repos not found are auto-registered on first `get_context` call
  - All MCP calls logged to `request_logs` table with full trace for debugging
