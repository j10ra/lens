import {
  Outlet,
  HeadContent,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import appCss from "@/global.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LENS Cloud" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement,t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme:dark)").matches))d.classList.add("dark");else d.classList.remove("dark")}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
