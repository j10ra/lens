import { Badge, PageHeader, Separator, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@lens/ui";
import { useState } from "react";
import { TraceWaterfall } from "../components/TraceWaterfall.js";
import { useTraceSpans, useTraces } from "../queries/use-traces.js";
import { selectTrace, useSelectedTraceId } from "../store/trace-store.js";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const ALL_SOURCES = ["cli", "mcp", "dashboard"] as const;

const SOURCE_COLORS: Record<string, string> = {
  cli: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20",
  mcp: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/20",
  dashboard: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
};

export function Traces() {
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set(["cli", "mcp"]));
  const sources = [...activeSources];
  const { data: traces, isLoading } = useTraces(sources);

  const selectedTraceId = useSelectedTraceId();
  const { data: spanData, isLoading: spansLoading } = useTraceSpans(selectedTraceId);
  const selected = traces?.find((t) => t.trace_id === selectedTraceId);

  const toggleSource = (src: string) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) {
        if (next.size === 1) return prev; // don't allow empty
        next.delete(src);
      } else {
        next.add(src);
      }
      return next;
    });
  };

  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Traces</span>
          <div className="flex items-center gap-1.5">
            {ALL_SOURCES.map((src) => {
              const active = activeSources.has(src);
              return (
                <Badge
                  key={src}
                  variant="outline"
                  className={`cursor-pointer select-none border text-[11px] transition-opacity ${active ? SOURCE_COLORS[src] : "opacity-30"}`}
                  onClick={() => toggleSource(src)}
                >
                  {src}
                </Badge>
              );
            })}
          </div>
        </div>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {isLoading ? (
          <Spinner />
        ) : !traces?.length ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No traces recorded yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60">
              <tr>
                <th className="border-b border-r border-border px-3 py-1.5 text-left text-xs font-medium text-muted-foreground w-10">
                  #
                </th>
                <th className="border-b border-r border-border px-3 py-1.5 text-left text-xs font-medium text-muted-foreground w-20">
                  Source
                </th>
                <th className="border-b border-r border-border px-3 py-1.5 text-left text-xs font-medium text-muted-foreground w-28">
                  Time
                </th>
                <th className="border-b border-r border-border px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">
                  Route
                </th>
                <th className="border-b border-border px-3 py-1.5 text-right text-xs font-medium text-muted-foreground w-20">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody>
              {traces.map((trace, i) => (
                <tr
                  key={trace.trace_id}
                  className="group cursor-pointer hover:bg-accent/30"
                  onClick={() => selectTrace(trace.trace_id === selectedTraceId ? null : trace.trace_id)}
                >
                  <td className="border-b border-r border-border px-3 py-1.5 font-mono tabular-nums text-muted-foreground">
                    {i + 1}
                  </td>
                  <td className="border-b border-r border-border px-3 py-1.5">
                    <Badge variant="outline" className={`border text-[10px] ${SOURCE_COLORS[trace.source] ?? ""}`}>
                      {trace.source}
                    </Badge>
                  </td>
                  <td className="border-b border-r border-border px-3 py-1.5 font-mono tabular-nums text-xs text-muted-foreground">
                    {formatTime(trace.started_at)}
                  </td>
                  <td className="border-b border-r border-border px-3 py-1.5 font-mono text-xs">
                    {trace.root_span_name}
                  </td>
                  <td className="border-b border-border px-3 py-1.5 text-right font-mono tabular-nums text-xs text-muted-foreground">
                    {trace.duration_ms}ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Sheet
        open={!!selectedTraceId}
        onOpenChange={(open) => {
          if (!open) selectTrace(null);
        }}
      >
        <SheetContent side="right" className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-mono text-sm">{selected?.root_span_name ?? ""}</SheetTitle>
            <SheetDescription>
              {selected && (
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className={`border text-[10px] ${SOURCE_COLORS[selected.source] ?? ""}`}>
                    {selected.source}
                  </Badge>
                  {selected.duration_ms}ms
                </span>
              )}
            </SheetDescription>
          </SheetHeader>
          <Separator className="my-4" />
          {spansLoading ? <Spinner /> : <TraceWaterfall spans={spanData?.spans ?? []} logs={spanData?.logs ?? []} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
