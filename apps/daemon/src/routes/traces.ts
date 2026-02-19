import { getTraceStore, lensRoute } from "@lens/core";
import { Hono } from "hono";

export const tracesRoutes = new Hono();

// GET /traces — list recent traces
tracesRoutes.get(
  "/",
  lensRoute("traces.list", async (c) => {
    const limit = Number(c.req.query("limit") ?? "50");
    const traces = getTraceStore().queryTraces(limit);
    return c.json(traces);
  }),
);

// GET /traces/:traceId — spans for one trace
tracesRoutes.get(
  "/:traceId",
  lensRoute("traces.get", async (c) => {
    const traceId = c.req.param("traceId");
    const spans = getTraceStore().querySpans(traceId);
    if (!spans.length) return c.json({ error: "trace not found" }, 404);
    return c.json({ traceId, spans });
  }),
);
