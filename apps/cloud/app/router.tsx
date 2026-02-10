import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultNotFoundComponent: () => (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <p className="text-4xl font-bold">404</p>
        <p className="text-sm text-muted-foreground">Page not found</p>
      </div>
    ),
  });
}

export async function getRouter() {
  return createRouter();
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
