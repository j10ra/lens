import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/PublicLayout";

export const Route = createFileRoute("/docs")({
  component: DocsLayout,
});

const navItems = [
  { label: "Getting Started", href: "/docs" },
];

function DocsLayout() {
  return (
    <PublicLayout>
      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-16">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-24 space-y-1">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Documentation
            </p>
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                activeProps={{ className: "block rounded-lg px-3 py-2 text-sm bg-accent text-accent-foreground" }}
                activeOptions={{ exact: true }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </PublicLayout>
  );
}
