import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { configureLensFn, configureLensRoute, configureLogger, createTraceStore } from "@lens/core";
import { configureEngineDb } from "@lens/engine";
import { startHttpServer } from "./http.js";

const DATA_DIR = process.env.LENS_DATA_DIR ?? join(homedir(), ".lens");
const TRACE_DB = join(DATA_DIR, "traces.db");
const INDEX_DB = join(DATA_DIR, "index.db");
const JSON_LOGS = process.argv.includes("--json");

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });

  const store = createTraceStore(TRACE_DB);
  configureLensFn(store);
  configureLensRoute(store);
  configureLogger(store, JSON_LOGS);

  configureEngineDb(INDEX_DB);

  // HTTP server — serves API, MCP, and dashboard
  // MCP sessions created on-demand at /mcp endpoint
  startHttpServer();
}

main().catch((err) => {
  process.stderr.write(`[daemon] fatal: ${String(err)}\n`);
  process.exit(1);
});
