Now I have a complete picture. Let me summarize the MCP server integration flow.

## Report

- **Tool calls**: 10
- **Files read**: 7
- **Key findings**:
  - **Dual-mode daemon**: The daemon (`apps/daemon/src/index.ts`) supports two modes: HTTP server (port 4111) or MCP stdio mode (`--stdio` flag). When `--stdio` is passed, it creates an MCP server and connects via `StdioServerTransport` for JSON-RPC communication over stdin/stdout.
  - **Tool registration** (`apps/daemon/src/mcp.ts:59-200`): The `createMcpServer()` function creates an `McpServer` instance and registers 4 tools using `server.registerTool()`: `get_context`, `list_repos`, `get_status`, and `index_repo`. Each tool has a Zod schema for input validation and an async handler.
  - **Context pipeline** (`packages/engine/src/context/context.ts:61-326`): The `get_context` tool calls `buildContext()` which:
    1. Ensures repo is indexed (diff scan if HEAD changed)
    2. Parses query intent via `parseQuery()` → `interpretQuery()` (TF-IDF scoring, concept expansion)
    3. Optionally runs vector search (Pro only, via `Capabilities.embedTexts`)
    4. Promotes co-change partners from git history
    5. Enriches with structural data (imports, 2-hop deps, co-changes)
    6. Resolves snippets and slices (Phase 3 context slicing)
    7. Formats via `formatContextPack()` with query-kind-specific templates (natural/symbol/error/stack_trace)
    8. Caches result (120s TTL, 20 entries LRU)
  - **Capabilities injection** (`apps/daemon/src/cloud-capabilities.ts`): Pro features (Voyage embeddings, LLM purpose summaries) are injected via the `Capabilities` interface. The daemon loads these at startup by checking the cloud API for plan status, then creates cloud capabilities only for Pro users.
  - **Formatter templates** (`packages/engine/src/context/formatter.ts:93-307`): The context pack output adapts to query kind—`formatSymbol()` for symbol lookups, `formatError()` for error messages, `formatStackTrace()` for stack traces, and `formatNatural()` as default. Progressive stripping kicks in when >2000 tokens.
