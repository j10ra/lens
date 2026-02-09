import {
  Monitor,
  GitBranch,
  Clock,
  Link2,
  Database,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const features: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "TF-IDF Scoring",
    description:
      "Code-domain stopwords, segment-aware path tokens. Filenames weighted 4x, directories 2x. Exports and docstrings included.",
    icon: Monitor,
  },
  {
    title: "Import Graph",
    description:
      "Forward/reverse imports, 2-hop dependencies, indegree boost for hub files. Dynamic file cap based on import depth.",
    icon: GitBranch,
  },
  {
    title: "Co-Change Analysis",
    description:
      "Git history patterns surface files that change together. Cluster-based promotion for related modules.",
    icon: Clock,
  },
  {
    title: "MCP Integration",
    description:
      "Claude Code auto-discovers LENS via .mcp.json. Zero configuration for MCP-compatible agents.",
    icon: Link2,
  },
  {
    title: "Local-First",
    description:
      "SQLite database at ~/.lens/data.db. Zero network calls. Works offline, works everywhere.",
    icon: Database,
  },
  {
    title: "Zero LLM Queries",
    description:
      "Context packs in ~10ms cached, ~0.5-7s cold. No API calls, no token costs, no latency.",
    icon: Zap,
  },
];

export function Features() {
  return (
    <section className="border-t border-border py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Built for AI-Assisted Development
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
          Every feature is designed to give AI agents the right context, fast.
        </p>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border bg-card p-6 transition-colors hover:border-primary/30"
            >
              <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-2.5 text-primary">
                <feature.icon className="size-6" />
              </div>
              <h3 className="mb-2 font-semibold text-card-foreground">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
