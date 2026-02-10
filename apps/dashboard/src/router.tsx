import { createRouter, createRootRoute, createRoute } from "@tanstack/react-router";
import { RootLayout } from "./layouts/RootLayout";
import { Overview } from "./pages/Overview";
import { Repos } from "./pages/Repos";
import { Requests } from "./pages/Requests";
import { Data } from "./pages/Data";
import { Jobs } from "./pages/Jobs";
import { Context } from "./pages/Context";

import { Usage } from "./pages/Usage";
import { Billing } from "./pages/Billing";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Overview,
});

const reposRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/repos",
  component: Repos,
});

const requestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/requests",
  component: Requests,
});

const dataRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/data",
  component: Data,
});

const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/jobs",
  component: Jobs,
});

const contextRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/context",
  component: Context,
});

const usageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/usage",
  component: Usage,
});

const billingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/billing",
  component: Billing,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  reposRoute,
  requestsRoute,
  dataRoute,
  jobsRoute,
  contextRoute,
  usageRoute,
  billingRoute,
]);

export const router = createRouter({
  routeTree,
  basepath: "/dashboard",
  defaultNotFoundComponent: () => <Overview />,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
