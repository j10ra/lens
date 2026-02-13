import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@lens/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

function UsageBar({
  label,
  used,
  limit,
  locked,
  description,
}: {
  label: string;
  used: number;
  limit?: number;
  locked?: boolean;
  description?: string;
}) {
  if (locked) {
    return (
      <Card className="border-border bg-background py-4 shadow-none opacity-60">
        <CardHeader className="pb-1">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              Pro
            </span>
          </div>
          <CardTitle className="mt-1 text-2xl font-semibold tabular-nums">—</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">Upgrade to Pro</p>
        </CardContent>
      </Card>
    );
  }

  if (!limit || limit <= 0) {
    return (
      <Card className="border-border bg-background py-4 shadow-none">
        <CardHeader className="pb-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <CardTitle className="mt-1 text-2xl font-semibold tabular-nums">{used.toLocaleString()}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">No quota (local only)</p>
        </CardContent>
      </Card>
    );
  }

  const pct = Math.min((used / limit) * 100, 100);
  const color = pct > 90 ? "bg-destructive" : pct > 70 ? "bg-yellow-500" : "bg-primary";

  return (
    <Card className="border-border bg-background py-4 shadow-none">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-xs text-muted-foreground/70 tabular-nums">
            {used.toLocaleString()} / {limit.toLocaleString()}
          </p>
        </div>
        <CardTitle className="mt-1 text-2xl font-semibold tabular-nums">{used.toLocaleString()}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        {description && <p className="mt-1.5 text-[10px] text-muted-foreground/60">{description}</p>}
      </CardContent>
    </Card>
  );
}

export function Usage() {
  const { data: local, isLoading } = useQuery({
    queryKey: ["dashboard-usage"],
    queryFn: api.localUsage,
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });

  const plan = local?.plan ?? "free";
  const isPro = plan === "pro";
  const quota = local?.quota;
  const today = local?.today;

  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium">Usage</span>
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto py-4 md:gap-6 md:py-6">
        <section className="px-4 lg:px-6">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's usage</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Local counters
              {local?.synced_at ? ` · last synced ${new Date(local.synced_at).toLocaleTimeString()}` : " · not synced"}
            </p>
          </div>
        </section>

        {isLoading || !today ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @3xl/main:grid-cols-3">
            <UsageBar label="Context Queries" used={today.context_queries} />
            <UsageBar label="Repos Indexed" used={today.repos_indexed} />
            <UsageBar
              label="Embedding Requests"
              used={today.embedding_requests}
              limit={quota?.embeddingRequests}
              locked={!isPro}
              description="API calls to Voyage. Each batch = 1 request."
            />
            <UsageBar
              label="Embedding Chunks"
              used={today.embedding_chunks}
              limit={quota?.embeddingChunks}
              locked={!isPro}
              description="Code chunks sent for vector embedding."
            />
            <UsageBar
              label="Purpose Summaries"
              used={today.purpose_requests}
              limit={quota?.purposeRequests}
              locked={!isPro}
              description="API calls to generate file summaries. Re-indexing re-counts."
            />
          </section>
        )}
      </div>
    </>
  );
}
