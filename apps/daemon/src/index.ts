import { spawn } from "node:child_process";
import { openSync, readFileSync, statSync, unlinkSync, watchFile, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Capabilities } from "@lens/engine";
import { closeDb, openDb } from "@lens/engine";

import { getCloudUrl } from "./config";

const LENS_DIR = join(homedir(), ".lens");
const PID_FILE = join(LENS_DIR, "daemon.pid");
const LOG_FILE = join(LENS_DIR, "daemon.log");

function writePid() {
  writeFileSync(PID_FILE, String(process.pid));
}

function removePid() {
  try {
    unlinkSync(PID_FILE);
  } catch {}
}

async function ensureApiKey(data: Record<string, unknown>): Promise<string | undefined> {
  if (data.api_key) return data.api_key as string;
  if (!data.access_token) return undefined;

  const cloudUrl = getCloudUrl();
  try {
    const res = await fetch(`${cloudUrl}/auth/key`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (!res.ok) {
      console.error(`[LENS] API key provisioning failed (${res.status})`);
      return undefined;
    }
    const { api_key } = (await res.json()) as { api_key: string };
    data.api_key = api_key;
    const authPath = join(homedir(), ".lens", "auth.json");
    writeFileSync(authPath, JSON.stringify(data, null, 2), { mode: 0o600 });
    console.error("[LENS] API key auto-provisioned");
    return api_key;
  } catch (e: any) {
    console.error(`[LENS] API key provisioning error: ${e?.message}`);
    return undefined;
  }
}

interface CapabilitiesResult {
  caps?: Capabilities;
  planData?: { plan: string; usage: Record<string, number>; quota: Record<string, number> };
}

async function loadCapabilities(db: ReturnType<typeof openDb>): Promise<CapabilitiesResult> {
  try {
    const authPath = join(homedir(), ".lens", "auth.json");
    const data = JSON.parse(readFileSync(authPath, "utf-8"));
    const apiKey = await ensureApiKey(data);
    if (!apiKey) return {};

    // Check plan — only Pro users get cloud capabilities
    const cloudUrl = getCloudUrl();
    const res = await fetch(`${cloudUrl}/api/usage/current`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.error(`[LENS] Plan check failed (${res.status}), capabilities disabled`);
      return {};
    }
    const usageData = (await res.json()) as {
      plan?: string;
      usage?: Record<string, number>;
      quota?: Record<string, number>;
    };
    const planData = {
      plan: usageData.plan ?? "free",
      usage: usageData.usage ?? {},
      quota: usageData.quota ?? {},
    };

    if (usageData.plan !== "pro") {
      console.error(`[LENS] Plan: ${usageData.plan ?? "free"} — Pro features disabled`);
      return { planData };
    }

    const { createCloudCapabilities } = await import("./cloud-capabilities");
    const { usageQueries, logQueries } = await import("@lens/engine");
    const caps = createCloudCapabilities(
      apiKey,
      (counter, amount) => {
        try {
          usageQueries.increment(db, counter as any, amount);
        } catch {}
      },
      (method, path, status, duration, source, reqBody, resBody) => {
        try {
          logQueries.insert(db, method, path, status, duration, source, reqBody, resBody?.length, resBody);
        } catch {}
      },
    );
    console.error("[LENS] Cloud capabilities enabled (Pro plan)");
    return { caps, planData };
  } catch {
    return {};
  }
}

async function main() {
  const db = openDb();
  const { caps, planData } = await loadCapabilities(db);

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
      resolve(selfDir, "../../dashboard/dist"), // monorepo dev
      resolve(selfDir, "../dashboard"), // legacy
      resolve(selfDir, "dashboard"), // publish: sibling
    ];
    const dashboardDist = candidates.find((p) => existsSync(p));

    const app = createApp(db, dashboardDist, caps, planData);

    const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
      console.error(`[LENS] HTTP server listening on 127.0.0.1:${port}`);
    });

    writePid();

    function shutdown() {
      console.error("[LENS] Shutting down...");
      app.stopTelemetrySync?.();
      server.close();
      closeDb();
      removePid();
      process.exit(0);
    }

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    // --- Auto-restart on package update ---
    const scriptPath = process.argv[1];
    if (scriptPath) {
      try {
        const startMtime = statSync(scriptPath).mtimeMs;
        watchFile(scriptPath, { interval: 30_000 }, (curr) => {
          if (curr.mtimeMs !== startMtime) {
            console.error("[LENS] Binary updated, restarting...");
            app.stopTelemetrySync?.();
            server.close();
            closeDb();
            removePid();
            // Re-spawn daemon with same entry point
            const logFd = openSync(LOG_FILE, "a");
            const child = spawn(process.execPath, [scriptPath], {
              detached: true,
              stdio: ["ignore", logFd, logFd],
              env: { ...process.env, LENS_DAEMON: "1" },
            });
            child.unref();
            process.exit(0);
          }
        });
      } catch {}
    }
  }
}

main().catch((e) => {
  console.error("[LENS] Fatal:", e);
  process.exit(1);
});
