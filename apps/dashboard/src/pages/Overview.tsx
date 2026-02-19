import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@lens/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Activity, FolderGit2, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { StatusBadge } from "../components/StatusBadge.js";
import { api } from "../lib/api.js";
import { useRepos } from "../queries/use-repos.js";

type StatCardItem = {
  label: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
};

function timeAgo(ts: string | null): string {
  if (!ts) return "never";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function Overview() {
  const navigate = useNavigate();
  const { data: repos } = useRepos();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: api.stats,
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

  const ic = "border-border/80 bg-muted/35 text-foreground/80";

  const statCards: StatCardItem[] = [
    {
      label: "Repos",
      value: stats?.repos_count ?? 0,
      description: "Registered repositories",
      icon: FolderGit2,
    },
    {
      label: "Files",
      value: (stats?.total_files ?? 0).toLocaleString(),
      description: "Indexed source files",
      icon: FolderGit2,
    },
    {
      label: "Uptime",
      value: uptimeStr,
      description: "Daemon process",
      icon: Activity,
    },
  ];

  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium">Overview</span>
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto py-4 md:gap-6 md:py-6">
        <section className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @3xl/main:grid-cols-4">
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
                    <span className={`rounded-md border p-1.5 ${ic}`}>
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

        {repos && repos.length > 0 && (
          <section className="px-4 lg:px-6">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Repositories</h2>
                <p className="text-xs text-muted-foreground">Tracked codebases and index status</p>
              </div>
            </div>
            <div className="grid gap-3 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
              {repos.map((repo) => (
                <Card
                  key={repo.id}
                  className="border-border bg-background py-4 shadow-none cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() => navigate(`/repos/${repo.id}`)}
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
