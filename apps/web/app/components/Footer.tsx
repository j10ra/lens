import { Link } from "@tanstack/react-router";

const productLinks = [
  { label: "Docs", to: "/docs" },
  { label: "Dashboard", to: "/dashboard" },
];

const resourceLinks = [
  { label: "Get Started", to: "/docs#quick-start" },
  { label: "GitHub", href: "https://github.com/j10ra/lens", external: true },
  {
    label: "npm Package",
    href: "https://www.npmjs.com/package/lens-engine",
    external: true,
  },
];

const legalLinks = [
  { label: "Privacy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
];

function FooterLink({
  label,
  to,
  href,
  external,
}: {
  label: string;
  to?: string;
  href?: string;
  external?: boolean;
}) {
  const className =
    "inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground";

  if (to) {
    return (
      <Link to={to} className={className}>
        {label}
      </Link>
    );
  }

  if (href) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className={className}
      >
        {label}
      </a>
    );
  }

  return null;
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))]">
          <div className="lg:pr-8">
            <Link to="/" className="inline-flex items-center gap-2 text-xl font-bold tracking-tight">
              <span className="text-primary">LENS</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Open-source code intelligence engine. Import graph, co-change
              analysis, hub detection — ranked results in one call.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Open Source
              </span>
              <span className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Local-first
              </span>
              <span className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                MCP Native
              </span>
            </div>
            <a
              href="mailto:hi@lens-engine.com"
              className="mt-5 inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              hi@lens-engine.com
            </a>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Product
            </h3>
            <ul className="space-y-2">
              {productLinks.map((item) => (
                <li key={item.label}>
                  <FooterLink {...item} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Resources
            </h3>
            <ul className="space-y-2">
              {resourceLinks.map((item) => (
                <li key={item.label}>
                  <FooterLink {...item} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Legal
            </h3>
            <ul className="space-y-2">
              {legalLinks.map((item) => (
                <li key={item.label}>
                  <FooterLink {...item} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} LENS. MIT License.</p>
          <p>Built for Claude Code, Cursor, and MCP-compatible agents.</p>
        </div>
      </div>
    </footer>
  );
}
