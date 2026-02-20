import { getTraceStore, lensRoute } from "@lens/core";
import { Hono } from "hono";

export const tracesRoutes = new Hono();

// GET /traces?source=cli,mcp&limit=50
tracesRoutes.get(
  "/",
  lensRoute("traces.list", async (c) => {
    const limit = Number(c.req.query("limit") ?? "50");
    const sourceParam = c.req.query("source");
    const sources = sourceParam ? sourceParam.split(",").map((s) => s.trim()) : undefined;
    const traces = getTraceStore().queryTraces(limit, sources);
    return c.json(traces);
  }),
);

// GET /traces/:traceId — spans + logs for one trace
tracesRoutes.get(
  "/:traceId",
  lensRoute("traces.get", async (c) => {
    const traceId = c.req.param("traceId") as string;
    const spans = getTraceStore().querySpans(traceId);
    if (!spans.length) return c.json({ error: "trace not found" }, 404);
    const logs = getTraceStore().queryLogs(traceId);
    return c.json({ traceId, spans, logs });
  }),
);
