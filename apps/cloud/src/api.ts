import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { sentry } from "./middleware/sentry";
import { authRoutes } from "./routes/auth";
import { billingRoutes } from "./routes/billing";
import { keyRoutes } from "./routes/keys";
import { proxyRoutes } from "./routes/proxy";
import { subscriptionRoutes } from "./routes/subscription";
import { telemetryRoutes } from "./routes/telemetry";
import { usageRoutes } from "./routes/usage";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowed = [
        "https://lens-engine.com",
        "https://cloud.lens-engine.com",
        "http://localhost:3000",
        "https://lens-website.pages.dev",
      ];
      if (allowed.includes(origin)) return origin;
      if (origin.endsWith(".lens-engine.com")) return origin;
      if (origin.endsWith(".up.railway.app")) return origin;
      return null;
    },
    credentials: true,
  }),
);

app.use("*", sentry);

app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

app.route("/auth", authRoutes);
app.route("/api/keys", keyRoutes);
app.route("/api/usage", usageRoutes);
app.route("/api/proxy", proxyRoutes);
app.route("/api/billing", billingRoutes);
app.route("/api/subscription", subscriptionRoutes);
app.route("/api/telemetry", telemetryRoutes);

export default app;
