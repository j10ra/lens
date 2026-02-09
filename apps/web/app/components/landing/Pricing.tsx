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

function Check() {
  return (
    <svg
      className="h-4 w-4 text-emerald-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function Dash() {
  return <span className="text-zinc-600">&mdash;</span>;
}

export function Pricing() {
  return (
    <section id="pricing" className="border-t border-zinc-800 py-24">
      <div className="mx-auto max-w-4xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Pricing
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-zinc-400">
          Free forever for local-only workflows. Upgrade for cloud-powered
          features.
        </p>

        <div className="mt-16 grid gap-8 md:grid-cols-2">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-xl border p-8 ${
                tier.highlight
                  ? "border-blue-500/50 bg-zinc-900 ring-1 ring-blue-500/20"
                  : "border-zinc-800 bg-zinc-900"
              }`}
            >
              <div className="mb-6">
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  <span className="text-sm text-zinc-400">{tier.period}</span>
                </div>
              </div>

              <ul className="mb-8 space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature.name} className="flex items-center gap-3">
                    {feature.included ? <Check /> : <Dash />}
                    <span
                      className={`text-sm ${feature.included ? "text-zinc-300" : "text-zinc-500"}`}
                    >
                      {feature.name}
                      {feature.value && feature.included && (
                        <span className="ml-1 text-zinc-500">
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
                    ? "bg-blue-600 text-white hover:bg-blue-500"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
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
