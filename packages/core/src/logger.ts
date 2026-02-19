import { storage } from "./context.js";
import type { TraceStore } from "./trace-store.js";

type LogLevel = "info" | "warn" | "error" | "debug";

let _store: TraceStore | undefined;
let _jsonMode = false;

export function configureLogger(store: TraceStore, jsonMode = false): void {
  _store = store;
  _jsonMode = jsonMode;
}

export const Logger = {
  info: (message: string) => log("info", message),
  warn: (message: string) => log("warn", message),
  error: (message: string) => log("error", message),
  debug: (message: string) => log("debug", message),
};

function log(level: LogLevel, message: string): void {
  const store = storage.getStore();
  const traceId = store?.traceId;
  const spanId = store?.spanStack.at(-1)?.spanId;
  const timestamp = Date.now();

  // Persist to TraceStore (async-safe: pushLog is synchronous buffer push)
  _store?.pushLog({ traceId, spanId, level, message, timestamp });

  // Write to stderr — NEVER stdout (MCP stdio uses stdout for JSON-RPC)
  const entry = _jsonMode
    ? `${JSON.stringify({ timestamp, level, message, traceId, spanId })}\n`
    : formatHuman(level, message, traceId, spanId);

  process.stderr.write(entry);
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  info: "INF",
  warn: "WRN",
  error: "ERR",
  debug: "DBG",
};

function formatHuman(level: LogLevel, message: string, traceId?: string, _spanId?: string): string {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const label = LEVEL_LABELS[level];
  const trace = traceId ? ` [${traceId.slice(0, 8)}]` : "";
  return `${ts} ${label}${trace} ${message}\n`;
}
