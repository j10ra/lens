import {
  Target,
  GitBranch,
  Clock,
  Link2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const features: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Intent-Based Retrieval",
    description:
      "Describe what you're building. LENS ranks every file by relevance using TF-IDF, path weight, exports, and docstrings — no keyword guessing.",
    icon: Target,
  },
  {
    title: "Understands Structure",
    description:
      "Import graph traversal, 2-hop dependency analysis, and hub-file boosting. Your agent sees the files that actually matter, not just string matches.",
    icon: GitBranch,
  },
  {
    title: "Learns from Git",
    description:
      "Files that change together get surfaced together. Co-change analysis catches cross-cutting concerns grep never finds.",
    icon: Clock,
  },
  {
    title: "MCP Native",
    description:
      "Run `lens repo register` — it writes .mcp.json automatically. Claude Code, Cursor, and any MCP-compatible agent auto-discovers LENS and calls it when needed. Zero friction.",
    icon: Link2,
  },
  {
    title: "Your Code Stays Local",
    description:
      "Everything runs on your machine. No code leaves your laptop. No cloud dependency. Works offline, works air-gapped.",
    icon: ShieldCheck,
  },
  {
    title: "One Call, Done",
    description:
      "One context query replaces dozens of glob/grep tool calls. ~10ms cached, under 1s cold. Fewer tokens spent searching, more spent building.",
    icon: Zap,
  },
];

export function Features() {
  return (
    <section className="border-t border-border py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Right Context, Right Code
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
          AI agents are only as good as the files they see.
          LENS gives them exactly what they need — nothing more, nothing less.
        </p>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_14px_30px_-24px_rgba(37,99,235,0.45)]"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/55 to-transparent opacity-80" />
              <div className="mb-5 inline-flex rounded-xl border border-primary/15 bg-primary/10 p-2.5 text-primary">
                <feature.icon className="size-6" />
              </div>
              <h3 className="mb-2 text-lg font-semibold tracking-tight text-card-foreground">
                {feature.title}
              </h3>
              <p className="text-[15px] leading-7 text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
