import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { configureLensFn, configureLensRoute, configureLogger, createTraceStore } from "@lens/core";
import { startHttpServer } from "./http.js";
import { startMcpServer } from "./mcp.js";

const DATA_DIR = process.env.LENS_DATA_DIR ?? join(homedir(), ".lens");
const TRACE_DB = join(DATA_DIR, "traces.db");
const JSON_LOGS = process.argv.includes("--json");

async function main(): Promise<void> {
  // Ensure data directory exists before TraceStore opens the DB
  mkdirSync(DATA_DIR, { recursive: true });

  // TraceStore must be created before any lensFn/lensRoute calls
  const store = createTraceStore(TRACE_DB);
  configureLensFn(store);
  configureLensRoute(store);
  configureLogger(store, JSON_LOGS);

  // HTTP server is non-blocking — returns immediately, event loop handles requests
  startHttpServer();

  // MCP stdio takes over stdin/stdout — must be called after HTTP is started
  // In non-MCP mode (e.g., direct curl testing), omit this call
  if (process.env.LENS_MCP !== "false") {
    await startMcpServer();
  }
}

main().catch((err) => {
  process.stderr.write(`[daemon] fatal: ${String(err)}\n`);
  process.exit(1);
});
