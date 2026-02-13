import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { RootLayout } from "./layouts/RootLayout";
import { Billing } from "./pages/Billing";
import { Context } from "./pages/Context";
import { Data } from "./pages/Data";
import { Overview } from "./pages/Overview";
import { RepoDetail } from "./pages/RepoDetail";
import { Repos } from "./pages/Repos";
import { Requests } from "./pages/Requests";
import { Usage } from "./pages/Usage";

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

const repoDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/repos/$repoId",
  component: RepoDetail,
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
  repoDetailRoute,
  requestsRoute,
  dataRoute,
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
