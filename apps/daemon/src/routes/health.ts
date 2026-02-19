import { lensRoute } from "@lens/core";
import { Hono } from "hono";

const startedAt = Date.now();

export const healthRoutes = new Hono();

healthRoutes.get(
  "/",
  lensRoute("health.get", async (c) => {
    return c.json({
      status: "ok",
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      version: "2.0.0",
    });
  }),
);
