import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "../dashboard";
import { getUsageCurrent, getUsageRange } from "@/lib/server-fns";

export const Route = createFileRoute("/dashboard/usage")({
  component: UsagePage,
});

interface PeriodData {
  periodStart: string;
  periodEnd: string;
  plan: string;
  quotas: {
    contextQueries: number;
    embeddingRequests: number;
    purposeRequests: number;
  };
  usage: {
    contextQueries: number;
    embeddingRequests: number;
    purposeRequests: number;
  };
}

interface DailyRow {
  date: string;
  contextQueries: number | null;
  embeddingRequests: number | null;
  purposeRequests: number | null;
}

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const pct = Math.min((used / limit) * 100, 100);
  const color =
    pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : "bg-blue-500";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">{label}</p>
        <p className="text-xs text-zinc-500">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function fmtPeriod(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt.format(s)} \u2013 ${fmt.format(e)}`;
}

function UsagePage() {
  const { userId } = useAuth();
  const [period, setPeriod] = useState<PeriodData | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const p = await getUsageCurrent({ data: { userId } });
      setPeriod(p);

      const rows = await getUsageRange({
        data: { userId, start: p.periodStart, end: p.periodEnd },
      });
      setDaily(
        rows
          .map((r: DailyRow & { date: string }) => ({
            date: r.date,
            contextQueries: r.contextQueries,
            embeddingRequests: r.embeddingRequests,
            purposeRequests: r.purposeRequests,
          }))
          .reverse(),
      );
      setLoading(false);
    })();
  }, [userId]);

  if (loading || !period) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Usage</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Current billing period: {fmtPeriod(period.periodStart, period.periodEnd)}
        </p>
      </div>

      {/* Period totals */}
      <div className="grid gap-4 sm:grid-cols-3">
        <UsageBar
          label="Context Queries"
          used={period.usage.contextQueries}
          limit={period.quotas.contextQueries}
        />
        <UsageBar
          label="Embedding Requests"
          used={period.usage.embeddingRequests}
          limit={period.quotas.embeddingRequests}
        />
        <UsageBar
          label="Purpose Summaries"
          used={period.usage.purposeRequests}
          limit={period.quotas.purposeRequests}
        />
      </div>

      {/* Daily breakdown */}
      <div>
        <h3 className="mb-4 text-sm font-semibold text-zinc-300">
          Daily Breakdown
        </h3>
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900">
                <th className="px-4 py-3 text-left font-medium text-zinc-300">
                  Date
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-300">
                  Queries
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-300">
                  Embeddings
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-300">
                  Summaries
                </th>
              </tr>
            </thead>
            <tbody>
              {daily.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-zinc-500"
                  >
                    No usage data for this period.
                  </td>
                </tr>
              ) : (
                daily.map((day) => (
                  <tr
                    key={day.date}
                    className="border-b border-zinc-800/50 last:border-0"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">
                      {day.date}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-300">
                      {(day.contextQueries ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-300">
                      {(day.embeddingRequests ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-300">
                      {(day.purposeRequests ?? 0).toLocaleString()}
                    </td>
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
