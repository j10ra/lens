import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { lensRoute } from "@lens/core";
import { getRawDb } from "@lens/engine";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { filesRoutes } from "./routes/files.js";
import { grepRoutes } from "./routes/grep.js";
import { healthRoutes } from "./routes/health.js";
import { reposRoutes } from "./routes/repos.js";
import { tracesRoutes } from "./routes/traces.js";

// CJS/ESM compat — same pattern used across all lens packages
declare const __filename: string | undefined;
const _file = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const DASHBOARD_DIST = process.env.LENS_DASHBOARD_DIST ?? join(dirname(_file), "../../../apps/dashboard/dist");

export const app = new Hono();

// CORS for local dev — allows Vite dev server (:5173) to call daemon (:4111)
app.use("*", cors());

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  // stderr — never stdout
  process.stderr.write(`[daemon] unhandled error: ${err.message}\n`);
  return c.json({ error: "Internal server error" }, 500);
});

// API routes MUST come before serveStatic — wildcard intercepts all requests
app.route("/health", healthRoutes);
app.route("/grep", grepRoutes);
app.route("/repos", reposRoutes);
app.route("/repos", filesRoutes);
app.route("/traces", tracesRoutes);

// GET /stats — system metrics for the dashboard Overview page
app.get(
  "/stats",
  lensRoute("stats.get", async (c) => {
    const db = getRawDb();
    const reposCount = (db.prepare("SELECT COUNT(*) AS n FROM repos").get() as { n: number }).n;
    const totalFiles = (db.prepare("SELECT COUNT(*) AS n FROM file_metadata").get() as { n: number }).n;
    const totalChunks = (db.prepare("SELECT COUNT(*) AS n FROM chunks").get() as { n: number }).n;
    return c.json({
      repos_count: reposCount,
      total_files: totalFiles,
      total_chunks: totalChunks,
      uptime_seconds: Math.floor(process.uptime()),
    });
  }),
);

// Dashboard static files — AFTER all API routes
// rewriteRequestPath strips leading slash so path.join(absoluteRoot, relPath) resolves correctly
app.get(
  "*",
  serveStatic({
    root: DASHBOARD_DIST,
    rewriteRequestPath: (p) => p.replace(/^\//, ""),
  }),
);
// SPA fallback — unmatched GET routes serve index.html so client-side router handles /repos, /traces, etc.
app.get(
  "*",
  serveStatic({
    path: join(DASHBOARD_DIST, "index.html"),
  }),
);

export function startHttpServer(): void {
  serve({ fetch: app.fetch, port: 4111 }, (info) => {
    process.stderr.write(`[daemon] HTTP server listening on :${info.port}\n`);
  });
}
