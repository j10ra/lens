import type { SpanRow } from "../queries/use-traces.js";

const BAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
];

function buildDepthMap(spans: SpanRow[]): Map<string, number> {
  const depthMap = new Map<string, number>();

  const getDepth = (spanId: string): number => {
    if (depthMap.has(spanId)) return depthMap.get(spanId)!;
    const span = spans.find((s) => s.span_id === spanId);
    if (!span || !span.parent_span_id) {
      depthMap.set(spanId, 0);
      return 0;
    }
    const d = getDepth(span.parent_span_id) + 1;
    depthMap.set(spanId, d);
    return d;
  };

  for (const span of spans) getDepth(span.span_id);
  return depthMap;
}

interface TraceWaterfallProps {
  spans: SpanRow[];
}

export function TraceWaterfall({ spans }: TraceWaterfallProps) {
  if (!spans.length) return null;

  const depthMap = buildDepthMap(spans);
  const sorted = [...spans].sort((a, b) => a.started_at - b.started_at);

  const traceStart = Math.min(...spans.map((s) => s.started_at));
  const traceEnd = Math.max(...spans.map((s) => s.started_at + s.duration_ms));
  const traceDuration = traceEnd - traceStart || 1;

  return (
    <div>
      <h4 className="mb-2 text-xs font-medium text-muted-foreground">Trace</h4>
      <div className="space-y-1 rounded-md border bg-muted/30 p-3">
        {sorted.map((span, i) => {
          const depth = depthMap.get(span.span_id) ?? 0;
          const left = ((span.started_at - traceStart) / traceDuration) * 100;
          const width = Math.max((span.duration_ms / traceDuration) * 100, 2);
          const color = span.error_message ? "bg-destructive" : BAR_COLORS[i % BAR_COLORS.length];

          return (
            <div key={span.span_id} className="flex items-center gap-2">
              <span
                className="w-28 truncate text-xs font-mono text-muted-foreground shrink-0"
                style={{ paddingLeft: `${depth * 16}px` }}
                title={span.name}
              >
                {span.name}
              </span>
              <div className="relative flex-1 h-4 rounded-sm bg-muted/50 overflow-hidden">
                <div
                  className={`absolute top-0 h-full rounded-sm opacity-80 ${color}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              </div>
              <span className="w-14 text-right text-xs font-mono tabular-nums text-muted-foreground shrink-0">
                {span.duration_ms}ms
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
