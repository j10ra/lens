import { Check as CheckIcon } from "lucide-react";

const features = [
  {
    name: "Context queries",
    free: "Unlimited",
    pro: "Unlimited",
    section: "core",
  },
  { name: "Local repos", free: "Unlimited", pro: "Unlimited", section: "core" },
  { name: "TF-IDF + Import graph", free: true, pro: true, section: "core" },
  { name: "Co-change analysis", free: true, pro: true, section: "core" },
  { name: "MCP integration", free: true, pro: true, section: "core" },

  { name: "Semantic embeddings", free: false, pro: true, section: "pro" },
  { name: "Purpose summaries", free: false, pro: true, section: "pro" },
  { name: "Vocab clusters", free: false, pro: true, section: "pro" },
];

const cloudApi = import.meta.env.VITE_CLOUD_API_URL;

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    summary: "Core local retrieval and MCP workflows.",
    accent: "from-muted-foreground/50 via-muted-foreground/10 to-transparent",
    cta: "Get Started",
    ctaHref: "/docs",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$9",
    period: "/mo",
    summary: "Semantic ranking for higher retrieval accuracy.",
    accent: "from-primary/70 via-primary/20 to-transparent",
    cta: "Subscribe",
    ctaHref: cloudApi
      ? `${cloudApi}/api/billing/subscribe?interval=monthly`
      : "/docs",
    highlight: true,
  },
  {
    name: "Pro Yearly",
    price: "$90",
    period: "/yr",
    summary: "Same Pro capabilities with annual savings.",
    accent: "from-success/70 via-success/20 to-transparent",
    badge: "Save 17%",
    cta: "Subscribe",
    ctaHref: cloudApi
      ? `${cloudApi}/api/billing/subscribe?interval=yearly`
      : "/docs",
    highlight: false,
  },
];

function Dash() {
  return <span className="text-muted-foreground/50">-</span>;
}

function FeatureValue({ value }: { value: boolean | string }) {
  if (value === true)
    return (
      <span className="inline-flex size-4 items-center justify-center rounded-full bg-success/12 text-success">
        <CheckIcon className="size-3" />
      </span>
    );
  if (value === false) return <Dash />;
  return (
    <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
      {value}
    </span>
  );
}

function getTierValue(
  tierName: string,
  feature: (typeof features)[number],
): boolean | string {
  return tierName === "Free" ? feature.free : feature.pro;
}

export function Pricing() {
  const coreFeatures = features.filter((f) => f.section === "core");
  const proFeatures = features.filter((f) => f.section === "pro");

  return (
    <section id="pricing" className="border-t border-border py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Pricing
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground">
          Free forever for local-only workflows. Upgrade for semantic search
          that makes your AI agent significantly more accurate.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-center text-xs uppercase tracking-[0.14em] text-muted-foreground">
          All plans include local indexing, import graph, and MCP integration
        </p>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => (
            <article
              key={tier.name}
              className={`relative overflow-hidden rounded-2xl border p-7 ${
                tier.highlight
                  ? "border-primary/50 bg-card/90 ring-1 ring-primary/20"
                  : "border-border/80 bg-card/70"
              }`}
            >
              <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${tier.accent}`} />
              <div className="mb-6">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-card-foreground">
                    {tier.name}
                  </h3>
                  {tier.badge && (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                      {tier.badge}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-card-foreground">
                    {tier.price}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {tier.period}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{tier.summary}</p>
              </div>

              <div className="mb-8 space-y-5">
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Core
                  </p>
                  <ul className="space-y-2.5">
                    {coreFeatures.map((f) => {
                      const value = getTierValue(tier.name, f);
                      const included = value !== false;
                      return (
                        <li key={f.name} className="flex items-center gap-3">
                          <FeatureValue value={value} />
                          <span
                            className={`text-sm ${included ? "text-card-foreground" : "text-muted-foreground"}`}
                          >
                            {f.name}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Pro Add-ons
                  </p>
                  <ul className="space-y-2.5">
                    {proFeatures.map((f) => {
                      const value = getTierValue(tier.name, f);
                      const included = value !== false;
                      return (
                        <li key={f.name} className="flex items-center gap-3">
                          <FeatureValue value={value} />
                          <span
                            className={`text-sm ${included ? "text-card-foreground" : "text-muted-foreground"}`}
                          >
                            {f.name}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              <a
                href={tier.ctaHref}
                className={`block w-full rounded-lg py-3 text-center text-sm font-semibold transition-colors ${
                  tier.highlight
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-secondary text-secondary-foreground hover:bg-accent"
                }`}
              >
                {tier.cta}
              </a>
            </article>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card/60 px-8 py-6 sm:flex-row">
          <div>
            <h3 className="text-lg font-semibold text-card-foreground">
              Enterprise
            </h3>
            <p className="text-sm text-muted-foreground">
              Custom volume, SLA, and on-prem deployment
            </p>
          </div>
          <a
            href="mailto:hi@lens-engine.com"
            className="rounded-lg border bg-secondary px-6 py-3 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-accent whitespace-nowrap"
          >
            Contact Sales
          </a>
        </div>
      </div>
    </section>
  );
}
