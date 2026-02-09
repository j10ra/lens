import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Activity, Cpu, Database, FolderGit2, type LucideIcon, Shapes } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@lens/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@lens/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@lens/ui";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

type StatCardItem = {
  label: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
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

  if (!stats && isLoading) return <Loading />;

  const uptime = stats?.uptime_seconds ?? 0;
  const uptimeStr =
    uptime < 60
      ? `${uptime}s`
      : uptime < 3600
        ? `${Math.floor(uptime / 60)}m`
        : `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

  const statCards: StatCardItem[] = [
    {
      label: "Repos",
      value: stats?.repos_count ?? 0,
      description: "Registered repositories",
      icon: FolderGit2,
      iconClassName: "border-border/80 bg-muted/35 text-foreground/80",
    },
    {
      label: "Chunks",
      value: (stats?.total_chunks ?? 0).toLocaleString(),
      description: "Indexed code segments",
      icon: Shapes,
      iconClassName: "border-border/80 bg-muted/35 text-foreground/80",
    },
    {
      label: "Embeddings",
      value: (stats?.total_embeddings ?? 0).toLocaleString(),
      description: "Vector embeddings",
      icon: Cpu,
      iconClassName: "border-border/80 bg-muted/35 text-foreground/80",
    },
    {
      label: "DB Size",
      value: `${stats?.db_size_mb ?? 0} MB`,
      description: "SQLite database",
      icon: Database,
      iconClassName: "border-border/80 bg-muted/35 text-foreground/80",
    },
    {
      label: "Uptime",
      value: uptimeStr,
      description: "Daemon process",
      icon: Activity,
      iconClassName: "border-border/80 bg-muted/35 text-foreground/80",
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

        <section className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-5">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label} className="border-border bg-background py-4 shadow-none">
                <CardHeader className="pb-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
                      <CardTitle className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</CardTitle>
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
                <Card key={repo.id} className="border-border bg-background py-4 shadow-none">
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
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md border border-border bg-background px-2 py-1.5">
                        <p className="text-muted-foreground">Files</p>
                        <p className="font-mono font-medium tabular-nums">{repo.files_indexed}</p>
                      </div>
                      <div className="rounded-md border border-border bg-background px-2 py-1.5">
                        <p className="text-muted-foreground">Chunks</p>
                        <p className="font-mono font-medium tabular-nums">{repo.chunk_count}</p>
                      </div>
                      <div className="rounded-md border border-border bg-background px-2 py-1.5">
                        <p className="text-muted-foreground">Embed</p>
                        <p className="font-mono font-medium tabular-nums">{repo.embedded_pct}%</p>
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
