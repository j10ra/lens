import { Toucan } from "toucan-js";
import { createMiddleware } from "hono/factory";
import type { Env } from "../env";

export const sentry = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const dsn = c.env.SENTRY_DSN;
  if (!dsn) {
    await next();
    return;
  }

  const instance = new Toucan({
    dsn,
    context: c.executionCtx,
    request: c.req.raw,
    environment: c.env.ENVIRONMENT,
  });

  try {
    await next();
  } catch (err) {
    instance.captureException(err);
    throw err;
  }
});
