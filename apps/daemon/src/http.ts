import { serve } from "@hono/node-server";
import { lensRoute } from "@lens/core";
import { getRawDb } from "@lens/engine";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { filesRoutes } from "./routes/files.js";
import { grepRoutes } from "./routes/grep.js";
import { healthRoutes } from "./routes/health.js";
import { reposRoutes } from "./routes/repos.js";
import { tracesRoutes } from "./routes/traces.js";

export const app = new Hono();

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  // stderr — never stdout
  process.stderr.write(`[daemon] unhandled error: ${err.message}\n`);
  return c.json({ error: "Internal server error" }, 500);
});

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

export function startHttpServer(): void {
  serve({ fetch: app.fetch, port: 4111 }, (info) => {
    process.stderr.write(`[daemon] HTTP server listening on :${info.port}\n`);
  });
}
