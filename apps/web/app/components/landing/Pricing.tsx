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

  { name: "Voyage embeddings", free: false, pro: true, section: "pro" },
  { name: "Purpose summaries", free: false, pro: true, section: "pro" },
  { name: "Vocab clusters", free: false, pro: true, section: "pro" },
];

const cloudApi = import.meta.env.VITE_CLOUD_API_URL;

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    cta: "Get Started",
    ctaHref: "/docs",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$9",
    period: "/mo",
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
    badge: "Save 17%",
    cta: "Subscribe",
    ctaHref: cloudApi
      ? `${cloudApi}/api/billing/subscribe?interval=yearly`
      : "/docs",
    highlight: false,
  },
];

function Dash() {
  return <span className="text-muted-foreground/50">&mdash;</span>;
}

function FeatureValue({ value }: { value: boolean | string }) {
  if (value === true) return <CheckIcon className="size-4 text-success" />;
  if (value === false) return <Dash />;
  return <span className="text-xs text-muted-foreground">{value}</span>;
}

export function Pricing() {
  const coreFeatures = features.filter((f) => f.section === "core");
  const proFeatures = features.filter((f) => f.section === "pro");

  return (
    <section id="pricing" className="border-t border-border py-24">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Pricing
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground">
          Free forever for local-only workflows. Upgrade for semantic search
          that makes your AI agent significantly more accurate.
        </p>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-xl border p-8 ${
                tier.highlight
                  ? "border-primary/50 bg-card ring-1 ring-primary/20"
                  : "border-border bg-card"
              }`}
            >
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
              </div>

              <ul className="mb-8 space-y-3">
                {coreFeatures.map((f) => {
                  const value = tier.name === "Free" ? f.free : f.pro;
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

                {proFeatures.map((f) => {
                  const value = tier.name === "Free" ? f.free : f.pro;
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
            </div>
          ))}
        </div>

        {/* Enterprise */}
        <div className="mt-8 rounded-xl border border-border bg-card px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-card-foreground">
              Enterprise
            </h3>
            <p className="text-sm text-muted-foreground">
              Custom volume, SLA, and on-prem deployment
            </p>
          </div>
          <a
            href="mailto:hi@lens-engine.dev"
            className="rounded-lg border bg-secondary px-6 py-3 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-accent whitespace-nowrap"
          >
            Contact Sales
          </a>
        </div>
      </div>
    </section>
  );
}
