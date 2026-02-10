import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CloudAuthGuard } from "@/components/CloudAuthGuard";
import { PageHeader } from "@lens/ui";

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-primary";

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground/70">{used.toLocaleString()} / {limit.toLocaleString()}</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function UsageContent() {
  const { data: current, isLoading } = useQuery({
    queryKey: ["cloud-usage-current"],
    queryFn: api.cloudUsageCurrent,
  });

  const periodStart = current?.periodStart;
  const periodEnd = periodStart
    ? new Date(new Date(periodStart).getFullYear(), new Date(periodStart).getMonth() + 1, 0).toISOString().slice(0, 10)
    : undefined;

  const { data: rangeData } = useQuery({
    queryKey: ["cloud-usage-range", periodStart, periodEnd],
    queryFn: () => api.cloudUsageRange(periodStart!, periodEnd!),
    enabled: !!periodStart && !!periodEnd,
  });

  if (isLoading || !current) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const usage = current.usage ?? {};
  const quota = current.quota ?? {};
  const daily = (rangeData?.usage ?? []).slice().reverse();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Usage</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Current billing period: {current.periodStart}
          {periodEnd ? ` \u2013 ${periodEnd}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <UsageBar label="Context Queries" used={usage.contextQueries ?? 0} limit={quota.contextQueries ?? 0} />
        <UsageBar label="Embedding Requests" used={usage.embeddingRequests ?? 0} limit={quota.embeddingRequests ?? 0} />
        <UsageBar label="Purpose Summaries" used={usage.purposeRequests ?? 0} limit={quota.purposeRequests ?? 0} />
      </div>

      <div>
        <h3 className="mb-4 text-sm font-semibold">Daily Breakdown</h3>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted">
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-right font-medium">Queries</th>
                <th className="px-4 py-3 text-right font-medium">Embeddings</th>
                <th className="px-4 py-3 text-right font-medium">Summaries</th>
              </tr>
            </thead>
            <tbody>
              {daily.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No usage data for this period.</td></tr>
              ) : (
                daily.map((day) => (
                  <tr key={day.date} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{day.date}</td>
                    <td className="px-4 py-2.5 text-right">{(day.contextQueries ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right">{(day.embeddingRequests ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right">{(day.purposeRequests ?? 0).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function Usage() {
  return (
    <>
      <PageHeader><h1 className="text-sm font-semibold">Usage</h1></PageHeader>
      <main className="flex-1 overflow-auto p-4 lg:p-6">
        <CloudAuthGuard><UsageContent /></CloudAuthGuard>
      </main>
    </>
  );
}
