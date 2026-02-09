import {
  Outlet,
  HeadContent,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import * as Sentry from "@sentry/react";
import appCss from "@/global.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LENS Cloud" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <Sentry.ErrorBoundary
          fallback={
            <div className="flex min-h-screen items-center justify-center">
              <p className="text-zinc-400">Something went wrong.</p>
            </div>
          }
        >
          <Outlet />
        </Sentry.ErrorBoundary>
        <Scripts />
      </body>
    </html>
  );
}
