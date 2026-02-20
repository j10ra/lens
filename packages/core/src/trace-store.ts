import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";

// ESM: import.meta.url is available. CJS: tsup banner injects createRequire,
// but import.meta is empty — fall back to __filename injected by CJS runtime.
declare const __filename: string | undefined;
const _file = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const __dir = dirname(_file);

export interface SpanRecord {
  spanId: string;
  traceId: string;
  parentSpanId: string | undefined;
  name: string;
  startedAt: number;
  durationMs: number;
  errorMessage?: string;
  inputSize?: number;
  outputSize?: number;
  input?: string; // JSON-serialized payload
  output?: string; // JSON-serialized response
  source?: string; // cli | mcp | dashboard | infra
}

export interface LogRecord {
  traceId?: string;
  spanId?: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  timestamp: number;
}

export class TraceStore {
  private db: ReturnType<typeof drizzle<typeof schema>>;
  private sqlite: Database.Database;
  private spanBuffer: SpanRecord[] = [];
  private logBuffer: LogRecord[] = [];
  private flushTimer: ReturnType<typeof setInterval>;
  private pruneTimer: ReturnType<typeof setInterval>;
  readonly retentionMs: number;

  constructor(dbPath: string, retentionMs = 7 * 24 * 60 * 60 * 1000) {
    this.sqlite = new Database(dbPath);
    // WAL mode before anything else — critical for concurrent read performance
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("synchronous = NORMAL");
    this.sqlite.pragma("foreign_keys = ON");

    this.db = drizzle(this.sqlite, { schema });

    // Published: drizzle-core/ sibling to daemon.js. Dev: ../drizzle relative to dist/
    const published = join(__dir, "drizzle-core");
    const migrationsFolder = existsSync(published) ? published : join(__dir, "..", "drizzle");
    migrate(this.db, { migrationsFolder });

    this.retentionMs = retentionMs;

    // Batch flush every 100ms — time-based batching, minimal complexity
    this.flushTimer = setInterval(() => this.flush(), 100);
    // Prune old traces hourly
    this.pruneTimer = setInterval(() => this.prune(), 60 * 60 * 1000);
  }

  pushSpan(span: SpanRecord): void {
    this.spanBuffer.push(span);
  }

  pushLog(log: LogRecord): void {
    this.logBuffer.push(log);
  }

  private flush(): void {
    if (this.spanBuffer.length === 0 && this.logBuffer.length === 0) return;

    const spans = this.spanBuffer.splice(0);
    const logs = this.logBuffer.splice(0);

    // Group spans by trace; upsert traces first (foreign key constraint)
    const traceMap = new Map<
      string,
      { name: string; source: string; startedAt: number; endedAt: number; durationMs: number }
    >();
    for (const s of spans) {
      const existing = traceMap.get(s.traceId);
      const isRoot = s.parentSpanId == null;
      if (!existing) {
        traceMap.set(s.traceId, {
          name: s.name,
          source: s.source ?? "unknown",
          startedAt: s.startedAt,
          endedAt: s.startedAt + s.durationMs,
          durationMs: s.durationMs,
        });
      } else {
        traceMap.set(s.traceId, {
          name: isRoot ? s.name : existing.name,
          source: isRoot && s.source ? s.source : existing.source,
          startedAt: Math.min(s.startedAt, existing.startedAt),
          endedAt: Math.max(s.startedAt + s.durationMs, existing.endedAt),
          durationMs: isRoot ? s.durationMs : existing.durationMs,
        });
      }
    }

    this.sqlite.transaction(() => {
      for (const [traceId, t] of traceMap) {
        this.sqlite
          .prepare(
            `INSERT INTO traces (trace_id, root_span_name, source, started_at, ended_at, duration_ms)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(trace_id) DO UPDATE SET
             root_span_name = CASE WHEN excluded.started_at <= traces.started_at THEN excluded.root_span_name ELSE traces.root_span_name END,
             source = CASE WHEN excluded.started_at <= traces.started_at THEN excluded.source ELSE traces.source END,
             started_at = MIN(excluded.started_at, traces.started_at),
             ended_at = MAX(excluded.ended_at, traces.ended_at),
             duration_ms = CASE WHEN excluded.started_at <= traces.started_at THEN excluded.duration_ms ELSE traces.duration_ms END`,
          )
          .run(traceId, t.name, t.source, t.startedAt, t.endedAt, t.durationMs);
      }

      for (const s of spans) {
        this.sqlite
          .prepare(
            `INSERT OR IGNORE INTO spans (span_id, trace_id, parent_span_id, name, started_at, duration_ms, error_message, input_size, output_size, input, output)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            s.spanId,
            s.traceId,
            s.parentSpanId ?? null,
            s.name,
            s.startedAt,
            s.durationMs,
            s.errorMessage ?? null,
            s.inputSize ?? null,
            s.outputSize ?? null,
            s.input ?? null,
            s.output ?? null,
          );
      }

      for (const l of logs) {
        this.sqlite
          .prepare(`INSERT INTO logs (trace_id, span_id, level, message, timestamp) VALUES (?, ?, ?, ?, ?)`)
          .run(l.traceId ?? null, l.spanId ?? null, l.level, l.message, l.timestamp);
      }
    })();
  }

  prune(): void {
    const cutoff = Date.now() - this.retentionMs;
    // Cascade delete handles spans and logs via foreign key (or manual if needed)
    this.sqlite.prepare(`DELETE FROM traces WHERE started_at < ?`).run(cutoff);
    // Orphaned logs (no trace_id) older than retention
    this.sqlite.prepare(`DELETE FROM logs WHERE trace_id IS NULL AND timestamp < ?`).run(cutoff);
  }

  close(): void {
    clearInterval(this.flushTimer);
    clearInterval(this.pruneTimer);
    this.flush();
    this.sqlite.close();
  }

  queryTraces(
    limit = 50,
    sources?: string[],
  ): Array<{
    trace_id: string;
    root_span_name: string;
    source: string;
    started_at: number;
    ended_at: number;
    duration_ms: number;
  }> {
    if (sources?.length) {
      const placeholders = sources.map(() => "?").join(",");
      return this.sqlite
        .prepare(`SELECT * FROM traces WHERE source IN (${placeholders}) ORDER BY started_at DESC LIMIT ?`)
        .all(...sources, limit) as Array<{
        trace_id: string;
        root_span_name: string;
        source: string;
        started_at: number;
        ended_at: number;
        duration_ms: number;
      }>;
    }
    return this.sqlite.prepare("SELECT * FROM traces ORDER BY started_at DESC LIMIT ?").all(limit) as Array<{
      trace_id: string;
      root_span_name: string;
      source: string;
      started_at: number;
      ended_at: number;
      duration_ms: number;
    }>;
  }

  querySpans(traceId: string): SpanRecord[] {
    return this.sqlite
      .prepare("SELECT * FROM spans WHERE trace_id = ? ORDER BY started_at ASC")
      .all(traceId) as SpanRecord[];
  }

  queryLogs(traceId: string): LogRecord[] {
    return this.sqlite
      .prepare("SELECT * FROM logs WHERE trace_id = ? ORDER BY timestamp ASC")
      .all(traceId) as LogRecord[];
  }
}

let _instance: TraceStore | undefined;

/** Factory — creates, stores, and returns the TraceStore singleton. */
export function createTraceStore(dbPath: string, retentionMs?: number): TraceStore {
  _instance = new TraceStore(dbPath, retentionMs);
  return _instance;
}

/** Returns the TraceStore singleton. Throws if createTraceStore() has not been called. */
export function getTraceStore(): TraceStore {
  if (!_instance) throw new Error("TraceStore not initialized — call createTraceStore() first");
  return _instance;
}
