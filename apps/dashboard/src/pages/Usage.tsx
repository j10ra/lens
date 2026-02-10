import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@lens/ui";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@lens/ui";

function UsageBar({ label, used, limit }: { label: string; used: number; limit?: number }) {
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
          <p className="text-xs text-muted-foreground/70 tabular-nums">{used.toLocaleString()} / {limit.toLocaleString()}</p>
        </div>
        <CardTitle className="mt-1 text-2xl font-semibold tabular-nums">{used.toLocaleString()}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `in ${hrs}h ${mins % 60}m`;
}

const RESULT_STYLES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  success: { variant: "default", label: "OK" },
  partial: { variant: "secondary", label: "Partial" },
  error: { variant: "destructive", label: "Failed" },
  skipped: { variant: "outline", label: "Skipped" },
};

function SyncStatusCard() {
  const { data: sync } = useQuery({
    queryKey: ["sync-status"],
    queryFn: api.syncStatus,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

  if (!sync) return null;

  const result = sync.lastResult ? RESULT_STYLES[sync.lastResult] : null;

  return (
    <section className="px-4 lg:px-6">
      <Card className="border-border bg-background shadow-none">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">Cloud Sync</CardTitle>
            {result && <Badge variant={result.variant}>{result.label}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex gap-6">
            <span>Last run: {sync.lastRunAt ? timeAgo(sync.lastRunAt) : "never"}</span>
            <span>Next: {timeUntil(sync.nextRunAt)}</span>
          </div>
          {sync.lastResult === "success" && sync.rowsSynced > 0 && (
            <p>{sync.rowsSynced} row{sync.rowsSynced > 1 ? "s" : ""} synced</p>
          )}
          {sync.unsyncedRows > 0 && (
            <p className="text-yellow-600 dark:text-yellow-400">
              {sync.unsyncedRows} unsynced: {sync.unsyncedDates.join(", ")}
            </p>
          )}
          {sync.lastError && (
            <p className="text-destructive">{sync.lastError}</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export function Usage() {
  const { data: local, isLoading } = useQuery({
    queryKey: ["dashboard-usage"],
    queryFn: api.localUsage,
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });

  const auth = useQuery({
    queryKey: ["auth-status"],
    queryFn: api.authStatus,
    placeholderData: keepPreviousData,
  });

  const isAuthed = auth.data?.authenticated;

  const { data: cloud } = useQuery({
    queryKey: ["cloud-usage-current"],
    queryFn: api.cloudUsageCurrent,
    enabled: !!isAuthed,
  });

  const quota = cloud?.quota;
  const today = local?.today;

  return (
    <>
      <PageHeader><span className="text-sm font-medium">Usage</span></PageHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto py-4 md:gap-6 md:py-6">
        <section className="px-4 lg:px-6">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's usage</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Local counters{local?.synced_at ? ` · last synced ${new Date(local.synced_at).toLocaleTimeString()}` : " · not synced"}
            </p>
          </div>
        </section>

        {isLoading || !today ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-5">
            <UsageBar label="Context Queries" used={today.context_queries} limit={quota?.contextQueries} />
            <UsageBar label="Embedding Requests" used={today.embedding_requests} limit={quota?.embeddingRequests} />
            <UsageBar label="Embedding Chunks" used={today.embedding_chunks} limit={quota?.embeddingChunks} />
            <UsageBar label="Purpose Summaries" used={today.purpose_requests} limit={quota?.purposeRequests} />
            <UsageBar label="Repos Indexed" used={today.repos_indexed} limit={quota?.reposIndexed} />
          </section>
        )}

        <SyncStatusCard />

        {!isAuthed && (
          <section className="px-4 lg:px-6">
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
              <p className="text-sm text-muted-foreground">Connect to LENS Cloud to see quota limits and sync usage.</p>
              <code className="mt-2 inline-block rounded-lg bg-muted px-4 py-1.5 text-xs font-mono">lens login</code>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
