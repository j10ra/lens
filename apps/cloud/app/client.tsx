/// <reference types="vite/client" />
import * as Sentry from "@sentry/react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_ENVIRONMENT ?? "development",
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
  tracePropagationTargets: ["localhost", /^https:\/\/lens\.dev\/api/],
});

hydrateRoot(document, <StartClient />);
