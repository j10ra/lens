import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { openDb, closeDb } from "@lens/engine";
import type { Capabilities } from "@lens/engine";

const PID_FILE = join(homedir(), ".lens", "daemon.pid");

function writePid() {
  writeFileSync(PID_FILE, String(process.pid));
}

function removePid() {
  try {
    unlinkSync(PID_FILE);
  } catch {}
}

async function loadCapabilities(): Promise<Capabilities | undefined> {
  try {
    const authPath = join(homedir(), ".lens", "auth.json");
    const data = JSON.parse(readFileSync(authPath, "utf-8"));
    if (!data.api_key) return undefined;

    const { createCloudCapabilities } = await import("./cloud-capabilities");
    const caps = createCloudCapabilities(data.api_key);
    console.error("[LENS] Cloud capabilities enabled");
    return caps;
  } catch {
    return undefined;
  }
}

async function main() {
  const db = openDb();
  const caps = await loadCapabilities();

  if (process.argv.includes("--stdio")) {
    // MCP stdio mode — stdout reserved for JSON-RPC
    const { createMcpServer } = await import("./mcp");
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");

    const mcpServer = createMcpServer(db, caps);
    const transport = new StdioServerTransport();

    process.on("SIGTERM", () => {
      closeDb();
      process.exit(0);
    });
    process.on("SIGINT", () => {
      closeDb();
      process.exit(0);
    });

    console.error("[LENS] MCP stdio server starting...");
    await mcpServer.connect(transport);
    console.error("[LENS] MCP stdio server connected");
  } else {
    // HTTP server mode
    const { createApp } = await import("./server");
    const { serve } = await import("@hono/node-server");
    const { resolve, dirname } = await import("node:path");
    const { existsSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");

    const port = Number(process.env.LENS_PORT) || 4111;

    // Resolve dashboard dist (sibling app in monorepo or bundled)
    const selfDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(selfDir, "../../dashboard/dist"),     // monorepo dev
      resolve(selfDir, "../dashboard"),              // legacy
      resolve(selfDir, "dashboard"),                 // publish: sibling
    ];
    const dashboardDist = candidates.find((p) => existsSync(p));

    const app = createApp(db, dashboardDist, caps);

    const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
      console.error(`[LENS] HTTP server listening on 127.0.0.1:${port}`);
    });

    writePid();

    function shutdown() {
      console.error("[LENS] Shutting down...");
      server.close();
      closeDb();
      removePid();
      process.exit(0);
    }

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }
}

main().catch((e) => {
  console.error("[LENS] Fatal:", e);
  process.exit(1);
});
