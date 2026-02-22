## Session Management in LENS MCP

The session management is entirely **in-memory** with no persistence. Here's what happens:

### Architecture

```
apps/daemon/src/mcp.ts
```

**Line 10** — Sessions stored in an in-memory Map:
```typescript
const sessions = new Map<string, { transport: WebStandardStreamableHTTPServerTransport; server: McpServer }>();
```

**Line 132-145** — Session creation on client connect:
```typescript
function createSession() {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      sessions.set(sessionId, { transport, server });  // In-memory only
    },
  });
}
```

**Lines 147-156** — Session lookup on subsequent requests:
```typescript
export async function handleMcp(c: Context): Promise<Response> {
  const sessionId = c.req.header("mcp-session-id");

  if (sessionId) {
    const entry = sessions.get(sessionId);
    if (entry) return entry.transport.handleRequest(c.req.raw);
    // Stale session (daemon restarted) — tell client to reinitialize
    return c.json({ jsonrpc: "2.0", error: { code: -32000, message: "Session expired" }, id: null }, 404);
  }
}
```

### Why This Happens on Daemon Restart

1. **Client connects** → MCP SDK generates UUID session ID → stored in `sessions` Map (RAM only)
2. **Client makes subsequent calls** → sends `mcp-session-id` header → daemon looks up in Map
3. **Daemon restarts** → process exits → all memory cleared → `sessions` Map is empty
4. **Client calls with old session ID** → not found in Map → "Session expired" error

### Design Rationale

This is **intentional behavior** from the MCP SDK:

- The `WebStandardStreamableHTTPServerTransport` is designed for stateful streaming connections
- Sessions tie tool state to a specific transport instance
- The `-32000` error code signals "reinitialize" — the MCP client should perform a new initialization handshake
- No disk persistence because sessions are tied to running transport/server objects that can't be serialized

### Recovery

When the MCP client receives "Session expired":
1. It should send a new `initialize` request without a session ID
2. Daemon creates a fresh session + transport
3. Client receives new session ID and continues normally

---

## Report

- **Tool calls**: 4
- **Tools used**: ToolSearch, Grep, Read
- **Files read**: 3
- **Files used**: apps/daemon/src/mcp.ts, apps/daemon/src/index.ts, apps/daemon/src/http.ts
- **Key findings**:
  - Sessions stored in-memory `Map` — no disk persistence (mcp.ts:10)
  - Session ID generated via UUID on first client connection (mcp.ts:137)
  - "Session expired" returned when session ID not found in map after restart (mcp.ts:155)
  - Error code `-32000` is standard MCP signal for client to reinitialize
