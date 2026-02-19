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
const __dirname = dirname(_file);

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

    // Migrations folder is co-located with the built package
    const migrationsFolder = join(__dirname, "..", "drizzle");
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
    const traceMap = new Map<string, { name: string; startedAt: number; endedAt: number; durationMs: number }>();
    for (const s of spans) {
      const existing = traceMap.get(s.traceId);
      if (!existing || s.startedAt < existing.startedAt) {
        traceMap.set(s.traceId, {
          name: s.parentSpanId == null ? s.name : (existing?.name ?? s.name),
          startedAt: Math.min(s.startedAt, existing?.startedAt ?? s.startedAt),
          endedAt: Math.max(s.startedAt + s.durationMs, existing?.endedAt ?? 0),
          durationMs: s.durationMs,
        });
      }
    }

    this.sqlite.transaction(() => {
      for (const [traceId, t] of traceMap) {
        this.sqlite
          .prepare(
            `INSERT INTO traces (trace_id, root_span_name, started_at, ended_at, duration_ms)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(trace_id) DO UPDATE SET ended_at = excluded.ended_at, duration_ms = excluded.duration_ms`,
          )
          .run(traceId, t.name, t.startedAt, t.endedAt, t.durationMs);
      }

      for (const s of spans) {
        this.sqlite
          .prepare(
            `INSERT OR IGNORE INTO spans (span_id, trace_id, parent_span_id, name, started_at, duration_ms, error_message, input_size, output_size)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  queryTraces(limit = 50): Array<{
    trace_id: string;
    root_span_name: string;
    started_at: number;
    ended_at: number;
    duration_ms: number;
  }> {
    return this.sqlite.prepare("SELECT * FROM traces ORDER BY started_at DESC LIMIT ?").all(limit) as Array<{
      trace_id: string;
      root_span_name: string;
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
