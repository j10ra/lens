## LENS v2 Tracing System Architecture

The tracing system is built around four interconnected components that create a hierarchical, context-aware observability layer.

### Component Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AsyncLocalStorage                             │
│  (Node.js async context propagation - maintains trace/span state)    │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   ┌───────────┐     ┌───────────┐      ┌───────────┐
   │ lensRoute │     │  lensFn   │      │  Logger   │
   │ (HTTP)    │────▶│ (engine)  │◀─────│ (logs)    │
   └─────┬─────┘     └─────┬─────┘      └─────┬─────┘
         │                 │                  │
         └─────────────────┼──────────────────┘
                           ▼
                    ┌─────────────┐
                    │ TraceStore  │
                    │  (SQLite)   │
                    └─────────────┘
```

### 1. AsyncLocalStorage (`context.ts`)

**Purpose**: Propagates trace context automatically through the async call stack without explicit parameter passing.

```typescript
// Single global storage instance
export const storage = new AsyncLocalStorage<TraceContext>();

// TraceContext holds the current trace state
interface TraceContext {
  traceId: string;        // Correlates all spans in one request
  spanStack: Span[];      // Hierarchical span nesting
}

// Each span represents one unit of work
interface Span {
  spanId: string;
  parentSpanId: string | undefined;  // Links to parent span
  name: string;
  startMs: number;
}
```

**Key insight**: `storage.run(ctx, fn)` establishes context for the entire async call tree. Any code inside `fn` can call `storage.getStore()` to access the current trace/span — no parameters needed.

---

### 2. lensRoute (`lens-route.ts`)

**Purpose**: Entry point wrapper for HTTP routes. Creates root spans, starts new traces.

```typescript
// Wraps Hono handlers
export function lensRoute(name: string, handler: Handler): Handler {
  return (c, next) => {
    const spanId = randomUUID();
    const traceId = randomUUID();  // NEW trace for each request
    
    const ctx: TraceContext = { 
      traceId, 
      spanStack: [{ spanId, parentSpanId: undefined, name, startMs }] 
    };
    
    return storage.run(ctx, async () => {
      // All code inside here sees this context
      const result = await handler(c, next);
      _store?.pushSpan({ ... });  // Persist to TraceStore
      return result;
    });
  };
}
```

**What it captures**:
- Request body (JSON POST/PUT/PATCH)
- Response body (JSON)
- Duration, source header (`x-lens-source`: cli/mcp/dashboard)
- Errors with messages

---

### 3. lensFn (`lens-fn.ts`)

**Purpose**: Wraps engine functions. Creates child spans, links to parent via `parentSpanId`.

```typescript
export function lensFn<TArgs, TReturn>(
  name: string, 
  fn: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return async (...args) => {
    const parent = storage.getStore();  // Get current context
    const spanId = randomUUID();
    const traceId = parent?.traceId ?? randomUUID();  // Inherit or start new
    
    const parentSpanId = parent?.spanStack.at(-1)?.spanId;  // Link to parent
    const span: Span = { spanId, parentSpanId, name, startMs };
    
    const ctx: TraceContext = {
      traceId,
      spanStack: parent ? [...parent.spanStack, span] : [span],  // Append to stack
    };
    
    return storage.run(ctx, async () => {
      const result = await fn(...args);
      _store?.pushSpan({ spanId, traceId, parentSpanId, ... });
      return result;
    });
  };
}
```

**Key insight**: If called inside a `lensRoute`, it inherits `traceId` and links via `parentSpanId`. If called standalone, it starts its own trace.

---

### 4. TraceStore (`trace-store.ts`)

**Purpose**: Persistent SQLite storage with batched writes for performance.

```typescript
class TraceStore {
  private spanBuffer: SpanRecord[] = [];
  private logBuffer: LogRecord[] = [];
  private flushTimer: ReturnType<typeof setInterval>;
  
  constructor(dbPath: string, retentionMs = 7 days) {
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");  // Concurrent read performance
    
    // Batch flush every 100ms
    this.flushTimer = setInterval(() => this.flush(), 100);
  }
  
  pushSpan(span: SpanRecord): void {
    this.spanBuffer.push(span);  // Sync push, async flush
  }
  
  private flush(): void {
    // Transactional batch insert
    this.sqlite.transaction(() => {
      // Upsert traces, insert spans, insert logs
    })();
  }
}
```

**Schema**:
- `traces` — root span metadata (trace_id, source, duration)
- `spans` — individual span records with parent linkage
- `logs` — structured logs tied to trace/span

---

### Logger Integration (`logger.ts`)

The Logger automatically captures trace context:

```typescript
function log(level: LogLevel, message: string): void {
  const store = storage.getStore();
  const traceId = store?.traceId;
  const spanId = store?.spanStack.at(-1)?.spanId;
  
  _store?.pushLog({ traceId, spanId, level, message, timestamp });
  process.stderr.write(entry);  // NEVER stdout (MCP uses stdout)
}
```

---

### Request Flow Example

```
HTTP GET /grep?query=auth
    │
    ▼
lensRoute("GET /grep", handler)
    │ creates traceId=abc123, spanId=span-1
    │ storage.run(ctx, ...)
    │
    ▼
  handler calls engine.grepRepo("auth")
    │
    ▼
  lensFn("grepRepo", fn)
    │ inherits traceId=abc123
    │ creates spanId=span-2, parentSpanId=span-1
    │ storage.run(ctx, ...)
    │
    ▼
    lensFn("scoreFiles", fn)
      │ inherits traceId=abc123
      │ creates spanId=span-3, parentSpanId=span-2
      └─▶ pushes span to buffer
    
    └─▶ pushes span to buffer
  
  └─▶ pushes span to buffer
    │
    ▼
TraceStore.flush() (100ms later)
    │ transactional batch insert to SQLite
    ▼
Dashboard queries /api/traces → TraceStore.queryTraces()
```

---

### Key Design Decisions

1. **AsyncLocalStorage** — Automatic context propagation without parameter drilling
2. **Span stack** — Maintains hierarchy; `spanStack.at(-1)` is always current span
3. **Batched writes** — 100ms intervals prevent I/O overhead on hot paths
4. **WAL mode** — SQLite WAL enables concurrent reads from dashboard while writes happen
5. **stderr for logs** — MCP protocol monopolizes stdout for JSON-RPC

## Report

- **Tool calls**: 5
- **Tools used**: ToolSearch, mcp__lens__lens_grep, Read
- **Files read**: 4
- **Files used**: packages/core/src/context.ts, packages/core/src/lens-fn.ts, packages/core/src/lens-route.ts, packages/core/src/trace-store.ts, packages/core/src/logger.ts
- **Key findings**:
  - AsyncLocalStorage (`context.ts`) provides automatic context propagation through the async call stack, eliminating parameter drilling
  - `lensRoute` creates root spans for HTTP requests with new traceIds, while `lensFn` creates child spans that inherit traceId and link via parentSpanId
  - TraceStore uses batched writes (100ms intervals) with SQLite WAL mode for concurrent read performance from the dashboard
  - Logger automatically captures trace/span context from AsyncLocalStorage and writes to stderr (never stdout due to MCP protocol)
  - Span hierarchy is maintained via `spanStack` array where `.at(-1)` always returns the current deepest span
