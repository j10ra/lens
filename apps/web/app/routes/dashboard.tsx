import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/PublicLayout";
import { Terminal, BarChart3, Database, CreditCard } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

/* ------------------------------------------------------------------ */
/*  Screenshot frame                                                     */
/* ------------------------------------------------------------------ */

function ScreenshotFrame({ title, caption, children }: {
  title: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {caption}
      </p>
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/70">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="size-[9px] rounded-full bg-foreground/12" />
            <span className="size-[9px] rounded-full bg-foreground/12" />
            <span className="size-[9px] rounded-full bg-foreground/12" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {title}
          </span>
        </div>
        <div className="pointer-events-none select-none p-4 sm:p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mock primitives                                                    */
/* ------------------------------------------------------------------ */

function Badge({ children, variant = "success" }: { children: ReactNode; variant?: "success" | "warning" | "muted" }) {
  const colors = {
    success: "bg-success/12 text-success border-success/30",
    warning: "bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/30",
    muted: "bg-muted/50 text-muted-foreground border-border/80",
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${colors[variant]}`}>
      {children}
    </span>
  );
}

function ProgressBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono tabular-nums">{value.toLocaleString()}/{max.toLocaleString()} ({pct}%)</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary/35 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, desc }: { label: string; value: string; desc?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/65 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const stats = [
  { label: "Repos", value: "4", desc: "registered" },
  { label: "Chunks", value: "12,847", desc: "across all repos" },
  { label: "Embeddings", value: "11,203", desc: "87% coverage" },
  { label: "DB Size", value: "28 MB" },
  { label: "Uptime", value: "3h 42m" },
];

const overviewRepos = [
  { name: "lens", path: "~/dev/lens", files: 142, chunks: 4218, embeds: 3901 },
  { name: "webapp", path: "~/dev/webapp", files: 87, chunks: 3412, embeds: 3102 },
];

const contextFiles = [
  "packages/engine/src/index/engine.ts",
  "packages/engine/src/index/scoring.ts",
  "packages/engine/src/context/pack.ts",
  "packages/engine/src/db/schema.ts",
  "apps/daemon/src/routes/context.ts",
];

const repoRows = [
  { name: "lens", status: "indexed", files: 142, chunks: 4218, embed: 92, indexed: "2m ago" },
  { name: "webapp", status: "indexed", files: 87, chunks: 3412, embed: 91, indexed: "14m ago" },
  { name: "api-server", status: "indexing", files: 64, chunks: 2103, embed: 47, indexed: "just now" },
  { name: "docs-site", status: "indexed", files: 31, chunks: 1114, embed: 100, indexed: "1h ago" },
];

const jobRepos = [
  { name: "lens", time: "2m ago", embedDone: 847, embedTotal: 847, purposeDone: 312, purposeTotal: 420, watcher: true },
  { name: "api-server", time: "just now", embedDone: 983, embedTotal: 2103, purposeDone: 0, purposeTotal: 640, watcher: true },
];

/* ------------------------------------------------------------------ */
/*  Preview sections                                                   */
/* ------------------------------------------------------------------ */

function OverviewPreview() {
  return (
    <ScreenshotFrame title="Overview" caption="System snapshot at a glance">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {overviewRepos.map((r) => (
          <div key={r.name} className="rounded-lg border border-border/70 bg-background/55 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{r.name}</span>
              <Badge>indexed</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{r.path}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                ["Files", r.files],
                ["Chunks", r.chunks],
                ["Embeds", r.embeds],
              ].map(([label, val]) => (
                <div key={label as string} className="rounded-md border border-border/70 px-2 py-1.5 text-center">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className="font-mono text-xs font-medium tabular-nums">{(val as number).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScreenshotFrame>
  );
}

function ContextPreview() {
  return (
    <ScreenshotFrame title="Context" caption="Build context packs interactively">
      <div className="flex gap-2">
        <div className="h-8 rounded-md border border-border bg-muted/30 px-2 text-xs leading-8 text-muted-foreground">lens</div>
        <div className="h-8 flex-1 rounded-md border border-border bg-muted/30 px-3 text-xs leading-8">
          indexing pipeline and scoring
        </div>
        <div className="h-8 rounded-md border border-primary/30 bg-primary/12 px-3 text-xs font-medium leading-8 text-primary">
          Query
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">12 files</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">4ms</span>
        <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">cached</span>
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border border-border/70">
        <div className="bg-muted/50 px-3 py-1.5 text-[10px] font-medium text-muted-foreground">
          <div className="flex">
            <span className="w-8 text-center">#</span>
            <span>File</span>
          </div>
        </div>
        {contextFiles.map((f, i) => (
          <div key={f} className="flex border-t border-border/70 px-3 py-1.5 text-xs odd:bg-muted/15">
            <span className="w-8 text-center font-mono text-[10px] text-muted-foreground/50 tabular-nums">{i + 1}</span>
            <span className="font-mono">{f}</span>
          </div>
        ))}
      </div>
    </ScreenshotFrame>
  );
}

function ReposPreview() {
  return (
    <ScreenshotFrame title={`Repositories \u00b7 ${repoRows.length} total`} caption="Monitor all registered repositories">
      <div className="overflow-hidden rounded-lg border border-border/70">
        <div className="bg-muted/50">
          <div className="grid grid-cols-[2rem_1fr_5rem_3.5rem_4rem_3.5rem_4.5rem] items-center gap-2 px-3 py-1.5 text-[10px] font-medium text-muted-foreground">
            <span className="text-center">#</span>
            <span>Name</span>
            <span>Status</span>
            <span className="text-right">Files</span>
            <span className="text-right">Chunks</span>
            <span className="text-right">Embed%</span>
            <span className="text-right">Indexed</span>
          </div>
        </div>
        {repoRows.map((r, i) => (
          <div key={r.name} className="grid grid-cols-[2rem_1fr_5rem_3.5rem_4rem_3.5rem_4.5rem] items-center gap-2 border-t border-border/70 px-3 py-1.5 text-xs odd:bg-muted/15">
            <span className="text-center font-mono text-[10px] text-muted-foreground/50 tabular-nums">{i + 1}</span>
            <span className="font-medium">{r.name}</span>
            <Badge variant={r.status === "indexed" ? "success" : "warning"}>{r.status}</Badge>
            <span className="text-right font-mono tabular-nums">{r.files}</span>
            <span className="text-right font-mono tabular-nums">{r.chunks.toLocaleString()}</span>
            <span className="text-right font-mono tabular-nums">{r.embed}%</span>
            <span className="text-right text-[11px] text-muted-foreground">{r.indexed}</span>
          </div>
        ))}
      </div>
    </ScreenshotFrame>
  );
}

function JobsPreview() {
  return (
    <ScreenshotFrame title={`Jobs \u00b7 ${jobRepos.length} repos`} caption="Track indexing and enrichment progress">
      <div className="grid gap-3 sm:grid-cols-2">
        {jobRepos.map((j) => (
          <div key={j.name} className="rounded-lg border border-border/70 bg-background/55 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{j.name}</span>
              <span className="text-[11px] text-muted-foreground">{j.time}</span>
            </div>
            <ProgressBar label="Embeddings" value={j.embedDone} max={j.embedTotal} />
            <ProgressBar label="Purpose" value={j.purposeDone} max={j.purposeTotal} />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Watcher</span>
              <Badge variant={j.watcher ? "success" : "muted"}>{j.watcher ? "active" : "inactive"}</Badge>
            </div>
          </div>
        ))}
      </div>
    </ScreenshotFrame>
  );
}

/* ------------------------------------------------------------------ */
/*  Extra pages list                                                   */
/* ------------------------------------------------------------------ */

const extraPages = [
  { icon: Terminal, name: "Requests", desc: "Live log of every API and MCP request with latency, status, and payload size" },
  { icon: Database, name: "Data Browser", desc: "Explore chunks, file metadata, imports, and co-change pairs per repo" },
  { icon: BarChart3, name: "Usage", desc: "Daily request counts, token estimates, and cache-hit ratios" },
  { icon: CreditCard, name: "Billing", desc: "Manage your Pro subscription, view invoices, and update payment method" },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function DashboardPage() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="border-b border-border py-20">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Dashboard
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Dashboard</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Manage repos, watch indexing jobs, build context packs — from the browser.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            <code className="rounded border border-border/70 bg-muted/45 px-2 py-1 font-mono text-xs">lens daemon start</code>{" "}
            then{" "}
            <code className="rounded border border-border/70 bg-muted/45 px-2 py-1 font-mono text-xs">lens dashboard</code>{" "}
            opens it at{" "}
            <code className="rounded border border-border/70 bg-muted/45 px-2 py-1 font-mono text-xs">localhost:4111/dashboard/</code>
          </p>
        </div>
      </section>

      {/* Previews */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl space-y-14 px-6">
          <OverviewPreview />
          <ContextPreview />
          <ReposPreview />
          <JobsPreview />
        </div>
      </section>

      {/* More pages */}
      <section className="border-t border-border py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            And More
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
            Four additional pages ship with the dashboard.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {extraPages.map((p) => (
              <div key={p.name} className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-5">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/55 to-transparent opacity-80" />
                <div className="flex gap-4">
                  <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
                    <p.icon className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-card-foreground">{p.name}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Get Started</h2>
          <p className="mt-3 text-muted-foreground">
            Install LENS, register a repo, and open the dashboard.
          </p>
          <div className="mx-auto mt-5 max-w-xl overflow-hidden rounded-lg border border-border/70">
            <div className="flex items-center justify-between border-b border-border/70 px-3 py-1.5 sm:px-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Terminal
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">bash</span>
            </div>
            <pre className="overflow-x-auto px-3 py-3 font-mono text-sm text-foreground sm:px-4 sm:py-4">
              <span className="text-muted-foreground/60">$ </span>
              <span className="text-primary">npx</span> lens-engine &amp;&amp; lens daemon start &amp;&amp; lens dashboard
            </pre>
          </div>
          <Link
            to="/docs"
            className="mt-6 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Read the Docs
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}
