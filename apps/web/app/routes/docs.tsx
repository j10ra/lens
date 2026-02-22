import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/PublicLayout";

export const Route = createFileRoute("/docs")({
  component: DocsLayout,
});

const docPages = [
  { label: "Getting Started", href: "/docs" },
  { label: "Dashboard", href: "/dashboard" },
];

const sectionLinks = [
  { label: "Overview", hash: "#overview" },
  { label: "Install", hash: "#install" },
  { label: "Quick Start", hash: "#quick-start" },
  { label: "What It Does", hash: "#what-it-does" },
  { label: "Benchmarks", hash: "#benchmarks" },
  { label: "MCP Integration", hash: "#mcp-integration" },
  { label: "Daemon Mode", hash: "#daemon-mode" },
  { label: "CLI Reference", hash: "#cli-reference" },
];

function DocsLayout() {
  return (
    <PublicLayout>
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-8 px-4 pb-16 pt-8 sm:px-6 lg:px-8 xl:flex-row xl:gap-12 xl:pt-12">
        <aside className="xl:sticky xl:top-24 xl:h-[calc(100vh-7rem)] xl:w-64 xl:shrink-0 xl:border-r xl:border-border/70 xl:pr-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Documentation
          </p>
          <nav className="mt-3 space-y-1">
            {docPages.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="block py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-6 border-t border-border/70 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              On This Page
            </p>
            <nav className="space-y-1">
              {sectionLinks.map((section) => (
                <a
                  key={section.hash}
                  href={`/docs${section.hash}`}
                  className="block py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {section.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-5 border-b border-border/70 pb-3 xl:hidden">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              On This Page
            </p>
            <div className="mt-2 flex gap-4 overflow-x-auto pb-1">
              {sectionLinks.map((section) => (
                <a
                  key={section.hash}
                  href={`/docs${section.hash}`}
                  className="whitespace-nowrap text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {section.label}
                </a>
              ))}
            </div>
          </div>

          <Outlet />
        </main>
      </div>
    </PublicLayout>
  );
}
