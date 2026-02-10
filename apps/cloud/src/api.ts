import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { sentry } from "./middleware/sentry";
import { authRoutes } from "./routes/auth";
import { keyRoutes } from "./routes/keys";
import { usageRoutes } from "./routes/usage";
import { proxyRoutes } from "./routes/proxy";
import { billingRoutes } from "./routes/billing";
import { subscriptionRoutes } from "./routes/subscription";
import { telemetryRoutes } from "./routes/telemetry";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: ["https://lens.dev", "http://localhost:3000"],
    credentials: true,
  }),
);

app.use("*", sentry);

app.get("/health", (c) =>
  c.json({ status: "ok", version: "0.1.0" }),
);

app.route("/auth", authRoutes);
app.route("/api/keys", keyRoutes);
app.route("/api/usage", usageRoutes);
app.route("/api/proxy", proxyRoutes);
app.route("/api/billing", billingRoutes);
app.route("/api/subscription", subscriptionRoutes);
app.route("/api/telemetry", telemetryRoutes);

export default app;
