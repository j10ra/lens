import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Users,
  BarChart3,
  Cpu,
  BookText,
  FolderGit2,
  Shapes,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@lens/ui";
import { adminGetGlobalUsage } from "@/lib/server-fns";

export const Route = createFileRoute("/dashboard/usage")({
  component: AdminUsagePage,
});

interface GlobalUsage {
  totalUsers: number;
  contextQueries: number;
  embeddingRequests: number;
  embeddingChunks: number;
  purposeRequests: number;
  reposIndexed: number;
}

type StatCardItem = {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
};

const ic = "border-border/80 bg-muted/35 text-foreground/80";

function AdminUsagePage() {
  const [data, setData] = useState<GlobalUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10);

    adminGetGlobalUsage({ data: { periodStart } })
      .then((usage) => {
        setData({
          totalUsers: usage?.totalUsers ?? 0,
          contextQueries: usage?.contextQueries ?? 0,
          embeddingRequests: usage?.embeddingRequests ?? 0,
          embeddingChunks: usage?.embeddingChunks ?? 0,
          purposeRequests: usage?.purposeRequests ?? 0,
          reposIndexed: usage?.reposIndexed ?? 0,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <>
        <PageHeader>
          <span className="text-sm font-medium">Usage</span>
        </PageHeader>
        <div className="flex flex-1 items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </>
    );
  }

  const stats: StatCardItem[] = [
    { label: "Active Users", value: data.totalUsers.toLocaleString(), description: "Users with usage this period", icon: Users },
    { label: "Context Queries", value: data.contextQueries.toLocaleString(), description: "Context pack requests", icon: BarChart3 },
    { label: "Embedding Requests", value: data.embeddingRequests.toLocaleString(), description: "Voyage API calls", icon: Cpu },
    { label: "Embedding Chunks", value: data.embeddingChunks.toLocaleString(), description: "Chunks vectorized", icon: Shapes },
    { label: "Summaries", value: data.purposeRequests.toLocaleString(), description: "File purpose generations", icon: BookText },
    { label: "Repos Indexed", value: data.reposIndexed.toLocaleString(), description: "Repositories indexed", icon: FolderGit2 },
  ];

  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium">Usage</span>
        <span className="text-xs text-muted-foreground">Current billing period</span>
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto py-4 md:py-6">
        <section className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @3xl/main:grid-cols-4">
          {stats.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label} className="border-border bg-background py-4 shadow-none">
                <CardHeader className="pb-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
                      <CardTitle className="mt-1 text-2xl font-semibold tabular-nums">
                        {card.value}
                      </CardTitle>
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
      </div>
    </>
  );
}
