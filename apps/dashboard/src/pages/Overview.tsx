import { Button, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@lens/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  BookText,
  Cpu,
  Database,
  FolderGit2,
  type LucideIcon,
  Network,
  Shapes,
  Sparkles,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

type StatCardItem = {
  label: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
  pro?: boolean;
};

export function Overview() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: api.stats,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

  const { data: repoData } = useQuery({
    queryKey: ["dashboard-repos"],
    queryFn: api.repos,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

  const { data: usage } = useQuery({
    queryKey: ["dashboard-usage"],
    queryFn: api.localUsage,
    refetchInterval: 30_000,
  });
  const isPro = (usage?.plan ?? "free") === "pro";

  if (!stats && isLoading) return <Loading />;

  const uptime = stats?.uptime_seconds ?? 0;
  const uptimeStr =
    uptime < 60
      ? `${uptime}s`
      : uptime < 3600
        ? `${Math.floor(uptime / 60)}m`
        : `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

  const ic = "border-border/80 bg-muted/35 text-foreground/80";

  const statCards: StatCardItem[] = [
    {
      label: "Repos",
      value: stats?.repos_count ?? 0,
      description: "Registered repositories",
      icon: FolderGit2,
      iconClassName: ic,
    },
    {
      label: "Chunks",
      value: (stats?.total_chunks ?? 0).toLocaleString(),
      description: "Code segments across all repos",
      icon: Shapes,
      iconClassName: ic,
    },
    {
      label: "Embeddings",
      value: (stats?.total_embeddings ?? 0).toLocaleString(),
      description: "Chunks with vector embeddings stored locally",
      icon: Cpu,
      iconClassName: ic,
      pro: true,
    },
    {
      label: "Summaries",
      value: (stats?.total_summaries ?? 0).toLocaleString(),
      description: "Files with a purpose summary in local DB",
      icon: BookText,
      iconClassName: ic,
      pro: true,
    },
    {
      label: "Vocab",
      value: (stats?.total_vocab_clusters ?? 0).toLocaleString(),
      description: "Term clusters for concept expansion",
      icon: Network,
      iconClassName: ic,
      pro: true,
    },
    {
      label: "DB Size",
      value: `${stats?.db_size_mb ?? 0} MB`,
      description: "Database",
      icon: Database,
      iconClassName: ic,
    },
    {
      label: "Uptime",
      value: uptimeStr,
      description: "Daemon process",
      icon: Activity,
      iconClassName: ic,
    },
  ];

  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium">Overview</span>
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto py-4 md:gap-6 md:py-6">
        <section className="px-4 lg:px-6">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">System snapshot</p>
            <p className="mt-1 text-sm">Live operational metrics for repositories and indexing throughput.</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @3xl/main:grid-cols-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            const locked = card.pro && !isPro;
            return (
              <Card
                key={card.label}
                className={`border-border bg-background py-4 shadow-none ${locked ? "opacity-60" : ""}`}
              >
                <CardHeader className="pb-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {card.label}
                        </p>
                        {locked && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                            Pro
                          </span>
                        )}
                      </div>
                      <CardTitle className="mt-1 text-2xl font-semibold tabular-nums">
                        {locked ? "—" : card.value}
                      </CardTitle>
                    </div>
                    <span className={`rounded-md border p-1.5 ${card.iconClassName}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">{card.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>

        {!isPro && (
          <section className="px-4 lg:px-6">
            <button
              type="button"
              onClick={() => navigate({ to: "/billing" })}
              className="flex w-full items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-left transition-colors hover:bg-amber-500/10"
            >
              <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Unlock enrichment</p>
                <p className="text-xs text-muted-foreground">
                  Semantic search, purpose summaries, and vocab clustering with Pro.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-amber-500 shrink-0" />
            </button>
          </section>
        )}

        {repoData?.repos && repoData.repos.length > 0 && (
          <section className="space-y-3 px-4 lg:px-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Repositories</h2>
                <p className="text-xs text-muted-foreground">Tracked codebases and index status</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate({ to: "/repos" })}>
                View all
              </Button>
            </div>
            <div className="grid gap-3 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
              {repoData.repos.map((repo) => (
                <Card
                  key={repo.id}
                  className="border-border bg-background py-4 shadow-none cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() =>
                    navigate({
                      to: "/repos/$repoId",
                      params: { repoId: repo.id },
                    })
                  }
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-sm">{repo.name}</CardTitle>
                        <p className="truncate text-xs text-muted-foreground">{repo.root_path}</p>
                      </div>
                      <StatusBadge status={repo.index_status} className="border-border bg-muted text-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-5 gap-2 text-xs">
                      <div className="rounded-md border border-border bg-background px-2 py-1.5">
                        <p className="text-muted-foreground">Files</p>
                        <p className="font-mono font-medium tabular-nums">{repo.files_indexed}</p>
                      </div>
                      <div className="rounded-md border border-border bg-background px-2 py-1.5">
                        <p className="text-muted-foreground">Chunks</p>
                        <p className="font-mono font-medium tabular-nums">{repo.chunk_count}</p>
                      </div>
                      <div
                        className={`rounded-md border border-border bg-background px-2 py-1.5 ${isPro ? "" : "opacity-40"}`}
                      >
                        <p className="text-muted-foreground">Embed</p>
                        <p className="font-mono font-medium tabular-nums">{isPro ? `${repo.embedded_pct}%` : "—"}</p>
                      </div>
                      <div
                        className={`rounded-md border border-border bg-background px-2 py-1.5 ${isPro ? "" : "opacity-40"}`}
                      >
                        <p className="text-muted-foreground">Summaries</p>
                        <p className="font-mono font-medium tabular-nums">
                          {isPro ? `${repo.purpose_count}/${repo.purpose_total}` : "—"}
                        </p>
                      </div>
                      <div
                        className={`rounded-md border border-border bg-background px-2 py-1.5 ${isPro ? "" : "opacity-40"}`}
                      >
                        <p className="text-muted-foreground">Vocab</p>
                        <p className="font-mono font-medium tabular-nums">{isPro ? repo.vocab_cluster_count : "—"}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Indexed {timeAgo(repo.last_indexed_at)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
