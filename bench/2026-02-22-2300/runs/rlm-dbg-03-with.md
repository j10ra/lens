## Session Management Explanation

The MCP session management works as follows:

### Architecture

```
┌─────────────────┐    POST /mcp     ┌─────────────────┐
│  MCP Client     │ ──────────────── │  Daemon :4111   │
│  (Claude/etc)   │                  │                 │
└────────┬────────┘                  │  sessions Map   │
         │                           │  (in-memory)    │
         │  mcp-session-id: <uuid>   └────────┬────────┘
         └────────────────────────────────────┘
```

### Session Lifecycle

1. **Initialization** — Client sends first request without `mcp-session-id` header
   - `createSession()` (line 132) creates a new `McpServer` + `WebStandardStreamableHTTPServerTransport`
   - Transport generates UUID via `sessionIdGenerator: () => randomUUID()`
   - `onsessioninitialized` callback stores `{ transport, server }` in the `sessions` Map (line 139)

2. **Subsequent Requests** — Client includes `mcp-session-id` header
   - `handleMcp()` extracts the header (line 148)
   - Looks up session in `sessions.get(sessionId)` (line 152)
   - Routes request to that session's transport (line 153)

3. **Daemon Restart** — **This is where the problem occurs**
   - The `sessions` Map is **in-memory only** (line 10: `new Map<string, ...>()`)
   - On restart, the Map is empty
   - Any request with the old session ID fails lookup
   - Returns 404 with error `"Session expired"` (line 155)

### Why It Fails After Restart

The root cause is **stateless server with stateful protocol**:

```typescript
// Line 10 — In-memory only, lost on restart
const sessions = new Map<string, { transport: WebStandardStreamableHTTPTransport; server: McpServer }>();

// Line 151-155 — No session found = expired error
if (sessionId) {
  const entry = sessions.get(sessionId);
  if (entry) return entry.transport.handleRequest(c.req.raw);
  // Daemon restarted, client has stale session ID
  return c.json({ jsonrpc: "2.0", error: { code: -32000, message: "Session expired" }, id: null }, 404);
}
```

The MCP client (Claude Desktop, etc.) stores the session ID across daemon restarts, but the daemon doesn't persist sessions. When the client sends its saved session ID to a freshly-started daemon, that ID doesn't exist in the new process's memory.

### Client Behavior

The MCP spec expects clients to handle `Session expired` by:
1. Clearing the stored session ID
2. Sending a new initialization request (no `mcp-session-id` header)
3. Getting a fresh session from the restarted daemon

This is correct protocol behavior — the error signals "start a new session" — but it causes temporary failures until the client reinitializes.

---

## Report

- **Tool calls**: 3
- **Tools used**: ToolSearch, mcp__lens__lens_grep, Grep, Read
- **Files read**: 1
- **Files used**: apps/daemon/src/mcp.ts, apps/daemon/src/http.ts
- **Key findings**:
  - Sessions stored in in-memory `Map<string, {transport, server}>` (line 10) — lost on daemon restart
  - `onsessioninitialized` callback stores session when transport generates UUID (line 138-139)
  - Client sends `mcp-session-id` header on subsequent requests; daemon returns 404 "Session expired" when lookup fails (line 155)
  - MCP protocol expects clients to reinitialize on "Session expired" error — this is correct but causes temporary failures after restart
