import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { lensRoute } from "@lens/core";
import { aggregateQueries, getEngineDb } from "@lens/engine";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { filesRoutes } from "./routes/files.js";
import { grepRoutes } from "./routes/grep.js";
import { healthRoutes } from "./routes/health.js";
import { reposRoutes } from "./routes/repos.js";
import { tracesRoutes } from "./routes/traces.js";

declare const __filename: string | undefined;
const _file = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const _dir = dirname(_file);
// Published: dashboard/ sibling to daemon.js. Dev: ../../../apps/dashboard/dist relative to dist/
const published = join(_dir, "dashboard");
const DASHBOARD_DIST =
  process.env.LENS_DASHBOARD_DIST ?? (existsSync(published) ? published : join(_dir, "../../../apps/dashboard/dist"));

export const app = new Hono();

app.use("*", cors());

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  process.stderr.write(`[daemon] unhandled error: ${err.message}\n`);
  return c.json({ error: "Internal server error" }, 500);
});

// ── Consumer layer — each consumer gets its own route group ─────────
// Source is determined by URL prefix, not headers. No race conditions.

function mountRoutes(router: Hono): void {
  router.route("/grep", grepRoutes);
  router.route("/repos", reposRoutes);
  router.route("/repos", filesRoutes);
  router.route("/traces", tracesRoutes);
  router.route("/health", healthRoutes);
  router.get(
    "/stats",
    lensRoute("stats.get", async (c) => {
      const { repos, files } = aggregateQueries.counts(getEngineDb());
      return c.json({
        repos_count: repos,
        total_files: files,
        uptime_seconds: Math.floor(process.uptime()),
      });
    }),
  );
}

function consumerRouter(source: string): Hono {
  const router = new Hono();
  router.use("*", async (c, next) => {
    c.req.raw.headers.set("x-lens-source", source);
    await next();
  });
  mountRoutes(router);
  return router;
}

app.route("/api/mcp", consumerRouter("mcp"));
app.route("/api/cli", consumerRouter("cli"));
app.route("/api/dashboard", consumerRouter("dashboard"));

// ── MCP — transport only, no lensRoute needed ───────────────────────
// MCP tools call /api/mcp/* routes which ARE traced via lensRoute.
app.all("/mcp", async (c) => {
  const { handleMcp } = await import("./mcp.js");
  return handleMcp(c);
});

// ── Dashboard SPA — static files + client-side routing fallback ─────
app.get(
  "*",
  serveStatic({
    root: DASHBOARD_DIST,
    rewriteRequestPath: (p) => p.replace(/^\//, ""),
  }),
);
app.get(
  "*",
  serveStatic({
    path: join(DASHBOARD_DIST, "index.html"),
  }),
);

export function startHttpServer(): void {
  const PORT = 4111;

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    process.stderr.write(`[daemon] HTTP server listening on :${info.port}\n`);
  });

  // Immediate shutdown on SIGTERM — don't wait for connections to drain.
  // tsup --onSuccess needs the port released before starting the new child.
  const shutdown = () => process.exit(0);
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
