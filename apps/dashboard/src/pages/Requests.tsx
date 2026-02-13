import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { darkStyles, JsonView } from "react-json-view-lite";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/utils";
import "react-json-view-lite/dist/index.css";
import {
  Button,
  PageHeader,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@lens/ui";

const STATUS_COLORS: Record<string, string> = {
  "2": "text-success",
  "3": "text-warning",
  "4": "text-warning",
  "5": "text-destructive",
};

const SOURCE_COLORS: Record<string, string> = {
  cli: "bg-blue-500/15 text-blue-400",
  mcp: "bg-purple-500/15 text-purple-400",
  api: "bg-emerald-500/15 text-emerald-400",
  dashboard: "bg-amber-500/15 text-amber-400",
  cloud: "bg-cyan-500/15 text-cyan-400",
  system: "bg-rose-500/15 text-rose-400",
};

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function tryParseJson(raw: string | null): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

type LogRow = Awaited<ReturnType<typeof api.logs>>["rows"][number];

interface TraceStep {
  step: string;
  duration_ms: number;
  detail?: string;
}

const jsonStyles = {
  ...darkStyles,
  container: "font-mono text-xs leading-relaxed",
  basicChildStyle: "pl-4",
  label: "text-blue-400 mr-1",
  nullValue: "text-muted-foreground",
  undefinedValue: "text-muted-foreground",
  numberValue: "text-amber-400",
  stringValue: "text-emerald-400",
  booleanValue: "text-purple-400",
  punctuation: "text-muted-foreground",
  collapseIcon: "text-muted-foreground cursor-pointer select-none",
  expandIcon: "text-muted-foreground cursor-pointer select-none",
};

function JsonSection({ label, raw }: { label: string; raw: string | null }) {
  const parsed = useMemo(() => tryParseJson(raw), [raw]);

  return (
    <section>
      <h4 className="mb-2 text-xs font-medium text-muted-foreground">{label}</h4>
      {raw ? (
        <div className="max-h-80 overflow-auto rounded-md border bg-muted/30 p-3">
          {parsed !== null ? (
            <JsonView
              data={parsed as Record<string, unknown>}
              shouldExpandNode={(level) => level < 2}
              style={jsonStyles}
            />
          ) : (
            <pre className="font-mono text-xs whitespace-pre-wrap break-all">{raw}</pre>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/60 italic">empty</p>
      )}
    </section>
  );
}

const BAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
];

function TraceWaterfall({ steps }: { steps: TraceStep[] }) {
  const maxDuration = Math.max(...steps.map((s) => s.duration_ms), 1);

  return (
    <section>
      <h4 className="mb-2 text-xs font-medium text-muted-foreground">Trace</h4>
      <div className="space-y-1 rounded-md border bg-muted/30 p-3">
        {steps.map((s, i) => {
          const pct = Math.max((s.duration_ms / maxDuration) * 100, 2);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: trace steps have no unique id
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 truncate font-mono text-muted-foreground">{s.step}</span>
              <div className="flex-1 h-4 rounded-sm bg-muted/50 overflow-hidden">
                <div
                  className={`h-full rounded-sm ${BAR_COLORS[i % BAR_COLORS.length]} opacity-80`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-14 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                {s.duration_ms}ms
              </span>
              {s.detail && (
                <span className="w-24 shrink-0 truncate text-right text-[10px] text-muted-foreground/70">
                  {s.detail}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Requests() {
  const [page, setPage] = useState(0);
  const [source, setSource] = useState<string>("");
  const [selected, setSelected] = useState<LogRow | null>(null);
  const pageSize = 100;

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-logs", page, source],
    queryFn: () =>
      api.logs({
        limit: pageSize,
        offset: page * pageSize,
        source: source || undefined,
      }),
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows = data?.rows ?? [];

  const traceSteps = useMemo<TraceStep[] | null>(() => {
    if (!selected?.trace) return null;
    const parsed = tryParseJson(selected.trace);
    if (!Array.isArray(parsed)) return null;
    return parsed as TraceStep[];
  }, [selected?.trace]);

  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium">Requests</span>
        <div className="ml-auto">
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(0);
            }}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All sources</option>
            <option value="cli">CLI</option>
            <option value="mcp">MCP</option>
            <option value="api">API</option>
            <option value="cloud">Cloud</option>
            <option value="system">System</option>
            <option value="dashboard">Dashboard</option>
          </select>
        </div>
      </PageHeader>

      {/* Grid */}
      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading && !data ? (
          <Spinner />
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/60 text-left">
                <th className="w-12 border-b border-r border-border bg-muted/60 px-2 py-2 text-center font-medium text-muted-foreground">
                  #
                </th>
                <th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">
                  Time
                </th>
                <th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">
                  Source
                </th>
                <th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">
                  Method
                </th>
                <th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">
                  Path
                </th>
                <th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">
                  Status
                </th>
                <th className="border-b border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground text-right">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    No requests logged yet
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const d = new Date(`${r.created_at}Z`);
                  const statusColor = STATUS_COLORS[String(r.status)[0]] ?? "";
                  const srcColor = SOURCE_COLORS[r.source] ?? "";
                  return (
                    <tr key={r.id} className="group cursor-pointer hover:bg-accent/30" onClick={() => setSelected(r)}>
                      <td className="border-b border-r border-border bg-muted/20 px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground tabular-nums">
                        {page * pageSize + i + 1}
                      </td>
                      <td className="border-b border-r border-border px-3 py-1.5 font-mono text-muted-foreground tabular-nums">
                        {d.toLocaleTimeString()}
                      </td>
                      <td className="border-b border-r border-border px-3 py-1.5">
                        <span className={`inline-block rounded px-1.5 py-0.5 font-medium ${srcColor}`}>{r.source}</span>
                      </td>
                      <td className="border-b border-r border-border px-3 py-1.5 font-mono">{r.method}</td>
                      <td className="border-b border-r border-border px-3 py-1.5 font-mono max-w-xs truncate">
                        {r.path}
                      </td>
                      <td className="border-b border-r border-border px-3 py-1.5 font-mono">
                        <span className={`font-medium ${statusColor}`}>{r.status}</span>
                      </td>
                      <td className="border-b border-border px-3 py-1.5 font-mono text-right text-muted-foreground tabular-nums">
                        {formatDuration(r.duration_ms)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" onClick={() => setPage(page - 1)} disabled={page === 0}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-1.5 tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <Button variant="ghost" size="icon-xs" onClick={() => setPage(page + 1)} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-sm">
                  {selected.method} {selected.path}
                </SheetTitle>
                <SheetDescription>
                  <span className={STATUS_COLORS[String(selected.status)[0]] ?? ""}>{selected.status}</span>
                  {" · "}
                  {formatDuration(selected.duration_ms)}
                  {" · "}
                  {formatBytes(selected.response_size)}
                  {" · "}
                  <span
                    className={`inline-block rounded px-1 py-0.5 text-[10px] font-medium ${SOURCE_COLORS[selected.source] ?? ""}`}
                  >
                    {selected.source}
                  </span>
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-col gap-4 px-4 pb-4">
                {traceSteps && traceSteps.length > 0 && (
                  <>
                    <Separator />
                    <TraceWaterfall steps={traceSteps} />
                  </>
                )}

                <Separator />
                <JsonSection label="Request Body" raw={selected.request_body} />
                <JsonSection label="Response Body" raw={selected.response_body} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
