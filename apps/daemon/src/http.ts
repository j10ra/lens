import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { healthRoutes } from "./routes/health.js";

export const app = new Hono();

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  // stderr — never stdout
  process.stderr.write(`[daemon] unhandled error: ${err.message}\n`);
  return c.json({ error: "Internal server error" }, 500);
});

app.route("/health", healthRoutes);

export function startHttpServer(): void {
  serve({ fetch: app.fetch, port: 4111 }, (info) => {
    process.stderr.write(`[daemon] HTTP server listening on :${info.port}\n`);
  });
}
