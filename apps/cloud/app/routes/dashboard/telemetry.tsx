import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@lens/ui";
import { DataTable } from "@/components/DataTable";
import { adminGetTelemetryStats } from "@/lib/server-fns";

export const Route = createFileRoute("/dashboard/telemetry")({
  component: TelemetryPage,
});

interface TelemetryStats {
  countsByType: Array<{ event_type: string; count: number }>;
  uniqueInstalls: number;
  dailyCounts: Array<{ day: string; count: number }>;
  recentEvents: Array<{
    id: string;
    telemetry_id: string;
    event_type: string;
    event_data: Record<string, string> | null;
    created_at: string;
  }>;
}

const TYPE_COLORS: Record<string, string> = {
  install: "bg-emerald-500/15 text-emerald-400",
  index: "bg-blue-500/15 text-blue-400",
  context: "bg-purple-500/15 text-purple-400",
  command: "bg-amber-500/15 text-amber-400",
  error: "bg-red-500/15 text-red-400",
};

function TelemetryPage() {
  const [data, setData] = useState<TelemetryStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGetTelemetryStats()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalEvents = data?.countsByType.reduce((s, r) => s + r.count, 0) ?? 0;

  const columns = data
    ? [
        {
          key: "telemetry_id",
          label: "Install ID",
          render: (row: (typeof data.recentEvents)[0]) => (
            <span className="text-muted-foreground" title={row.telemetry_id}>
              {row.telemetry_id.slice(0, 8)}
            </span>
          ),
        },
        {
          key: "event_type",
          label: "Type",
          render: (row: (typeof data.recentEvents)[0]) => (
            <span
              className={`inline-block rounded px-1.5 py-0.5 font-medium ${TYPE_COLORS[row.event_type] ?? "bg-muted text-muted-foreground"}`}
            >
              {row.event_type}
            </span>
          ),
        },
        {
          key: "event_data",
          label: "Data",
          className: "max-w-xs",
          render: (row: (typeof data.recentEvents)[0]) =>
            row.event_data ? (
              <pre className="truncate font-mono text-muted-foreground">
                {JSON.stringify(row.event_data)}
              </pre>
            ) : (
              <span className="italic text-muted-foreground/40">NULL</span>
            ),
        },
        {
          key: "created_at",
          label: "Timestamp",
          render: (row: (typeof data.recentEvents)[0]) => (
            <span className="text-muted-foreground tabular-nums">
              {new Date(row.created_at).toLocaleString("en-CA", {
                dateStyle: "short",
                timeStyle: "medium",
              })}
            </span>
          ),
        },
      ]
    : [];

  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium">Telemetry</span>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span>{data?.uniqueInstalls.toLocaleString() ?? 0} installs</span>
          <span>{totalEvents.toLocaleString()} events</span>
        </div>
      </PageHeader>
      <div className="flex flex-col flex-1 min-h-0">
        {loading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={columns}
            rows={(data?.recentEvents ?? []) as Array<Record<string, unknown>>}
            emptyMessage="No telemetry events yet"
          />
        )}
      </div>
    </>
  );
}

function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
