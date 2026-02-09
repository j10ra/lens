import { Check as CheckIcon } from "lucide-react";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    cta: "Install Free",
    ctaHref: "#how-it-works",
    highlight: false,
    features: [
      { name: "Context queries", value: "Unlimited", included: true },
      { name: "TF-IDF + Import graph", value: null, included: true },
      { name: "MCP integration", value: null, included: true },
      { name: "Local repos", value: "Unlimited", included: true },
      { name: "Voyage embeddings", value: null, included: false },
      { name: "Purpose summaries", value: null, included: false },
      { name: "Vocab clusters", value: null, included: false },
      { name: "API keys", value: "1", included: true },
    ],
  },
  {
    name: "Pro",
    price: "$9",
    period: "/mo",
    cta: "Upgrade to Pro",
    ctaHref: "/login",
    highlight: true,
    features: [
      { name: "Context queries", value: "Unlimited", included: true },
      { name: "TF-IDF + Import graph", value: null, included: true },
      { name: "MCP integration", value: null, included: true },
      { name: "Local repos", value: "Unlimited", included: true },
      { name: "Voyage embeddings", value: null, included: true },
      { name: "Purpose summaries", value: null, included: true },
      { name: "Vocab clusters", value: null, included: true },
      { name: "API keys", value: "5", included: true },
    ],
  },
];

function Dash() {
  return <span className="text-muted-foreground/50">&mdash;</span>;
}

export function Pricing() {
  return (
    <section id="pricing" className="border-t border-border py-24">
      <div className="mx-auto max-w-4xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Pricing
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground">
          Free forever for local-only workflows. Upgrade for cloud-powered
          features.
        </p>

        <div className="mt-16 grid gap-8 md:grid-cols-2">
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
                <h3 className="text-lg font-semibold text-card-foreground">{tier.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-card-foreground">{tier.price}</span>
                  <span className="text-sm text-muted-foreground">{tier.period}</span>
                </div>
              </div>

              <ul className="mb-8 space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature.name} className="flex items-center gap-3">
                    {feature.included ? (
                      <CheckIcon className="size-4 text-success" />
                    ) : (
                      <Dash />
                    )}
                    <span
                      className={`text-sm ${feature.included ? "text-card-foreground" : "text-muted-foreground"}`}
                    >
                      {feature.name}
                      {feature.value && feature.included && (
                        <span className="ml-1 text-muted-foreground">
                          ({feature.value})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
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
      </div>
    </section>
  );
}
