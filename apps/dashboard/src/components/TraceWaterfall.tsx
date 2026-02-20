import { Badge, Separator } from "@lens/ui";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { LogRow, SpanRow } from "../queries/use-traces.js";

const BAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
];

const LOG_COLORS: Record<string, string> = {
  info: "text-blue-500",
  warn: "text-amber-500",
  error: "text-red-500",
  debug: "text-muted-foreground",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-sm hover:bg-accent/50"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

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

function JsonValue({ value }: { value: unknown }) {
  if (value === null) return <span className="text-muted-foreground italic">null</span>;
  if (value === undefined) return <span className="text-muted-foreground italic">undefined</span>;
  if (typeof value === "boolean") return <span className="text-purple-500">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-blue-500">{value}</span>;
  if (typeof value === "string") {
    const display = value.length > 120 ? `${value.slice(0, 120)}…` : value;
    return <span className="text-emerald-600 dark:text-emerald-400">"{display}"</span>;
  }
  return <span className="text-muted-foreground">{String(value)}</span>;
}

function JsonPreview({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">[]</span>;
    return <span className="text-muted-foreground">[{value.length}]</span>;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return <span className="text-muted-foreground">{"{}"}</span>;
    const preview = keys.slice(0, 3).join(", ");
    const suffix = keys.length > 3 ? ", …" : "";
    return <span className="text-muted-foreground">{`{${preview}${suffix}}`}</span>;
  }
  return null;
}

function JsonNode({ keyName, value, defaultOpen = true }: { keyName?: string; value: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const isExpandable = value !== null && typeof value === "object";

  if (!isExpandable) {
    return (
      <div className="flex items-baseline gap-1 py-px">
        {keyName != null && <span className="text-rose-500 dark:text-rose-400">{keyName}:</span>}
        <JsonValue value={value} />
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);

  return (
    <div>
      <button
        type="button"
        className="flex items-baseline gap-1 py-px hover:bg-accent/30 rounded-sm -mx-0.5 px-0.5 w-full text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="text-muted-foreground select-none w-3 shrink-0">{open ? "▾" : "▸"}</span>
        {keyName != null && <span className="text-rose-500 dark:text-rose-400">{keyName}:</span>}
        {!open && <JsonPreview value={value} />}
        {open && (
          <span className="text-muted-foreground">{Array.isArray(value) ? `Array(${value.length})` : `Object`}</span>
        )}
      </button>
      {open && (
        <div className="ml-4 border-l border-border/50 pl-2">
          {entries.map(([k, v]) => (
            <JsonNode key={k} keyName={k} value={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function JsonTree({ label, data }: { label: string; data: string | null }) {
  if (!data) return null;

  let parsed: unknown;
  let formatted: string;
  try {
    parsed = JSON.parse(data);
    formatted = JSON.stringify(parsed, null, 2);
  } catch {
    return (
      <div className="mt-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
          <CopyButton text={data} />
        </div>
        <pre className="mt-0.5 rounded bg-muted/50 p-2 text-[11px] font-mono">{data}</pre>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <CopyButton text={formatted} />
      </div>
      <div className="mt-0.5 rounded bg-muted/50 p-2 text-[11px] font-mono leading-relaxed max-h-64 overflow-auto">
        <JsonNode value={parsed} defaultOpen />
      </div>
    </div>
  );
}

interface TraceWaterfallProps {
  spans: SpanRow[];
  logs?: LogRow[];
}

export function TraceWaterfall({ spans, logs }: TraceWaterfallProps) {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);

  if (!spans.length) return null;

  const depthMap = buildDepthMap(spans);
  const sorted = [...spans].sort((a, b) => a.started_at - b.started_at);

  const traceStart = Math.min(...spans.map((s) => s.started_at));
  const traceEnd = Math.max(...spans.map((s) => s.started_at + s.duration_ms));
  const traceDuration = traceEnd - traceStart || 1;

  // Auto-select root span so input/output is visible immediately
  const activeSpanId = selectedSpanId ?? sorted[0]?.span_id ?? null;
  const selectedSpan = activeSpanId ? spans.find((s) => s.span_id === activeSpanId) : null;
  const spanLogs = activeSpanId ? logs?.filter((l) => l.span_id === activeSpanId) : undefined;

  return (
    <div className="space-y-4">
      {/* Waterfall */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">Spans</h4>
        <div className="space-y-1 rounded-md border bg-muted/30 p-3">
          {sorted.map((span, i) => {
            const depth = depthMap.get(span.span_id) ?? 0;
            const left = ((span.started_at - traceStart) / traceDuration) * 100;
            const width = Math.max((span.duration_ms / traceDuration) * 100, 2);
            const color = span.error_message ? "bg-destructive" : BAR_COLORS[i % BAR_COLORS.length];
            const isSelected = span.span_id === activeSpanId;

            return (
              <div
                key={span.span_id}
                className={`flex cursor-pointer items-center gap-2 rounded-sm px-1 -mx-1 ${isSelected ? "bg-accent" : "hover:bg-accent/30"}`}
                onClick={() => setSelectedSpanId(span.span_id)}
              >
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

      {/* Selected span detail */}
      {selectedSpan && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-muted-foreground">
            {selectedSpan.name}
            {selectedSpan.error_message && (
              <Badge variant="outline" className="ml-2 border-destructive text-destructive text-[10px]">
                error
              </Badge>
            )}
          </h4>

          {selectedSpan.error_message && (
            <pre className="mb-2 rounded bg-destructive/10 p-2 text-[11px] text-destructive font-mono">
              {selectedSpan.error_message}
            </pre>
          )}

          <JsonTree label="input" data={selectedSpan.input} />
          <JsonTree label="output" data={selectedSpan.output} />

          {/* Logs for this span */}
          {spanLogs && spanLogs.length > 0 && (
            <>
              <Separator className="my-3" />
              <h4 className="mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Logs</h4>
              <div className="space-y-0.5 rounded bg-muted/30 p-2">
                {spanLogs.map((log, i) => (
                  <div key={`${log.timestamp}-${i}`} className="flex gap-2 text-[11px] font-mono">
                    <span className="shrink-0 text-muted-foreground">
                      {new Date(log.timestamp).toISOString().slice(11, 23)}
                    </span>
                    <span className={`shrink-0 uppercase ${LOG_COLORS[log.level] ?? ""}`}>{log.level}</span>
                    <span className="break-all">{log.message}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Trace-level logs (not attached to any span) */}
      {logs && logs.filter((l) => !l.span_id).length > 0 && (
        <>
          <Separator />
          <div>
            <h4 className="mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Trace Logs</h4>
            <div className="space-y-0.5 rounded bg-muted/30 p-2">
              {logs
                .filter((l) => !l.span_id)
                .map((log, i) => (
                  <div key={`${log.timestamp}-${i}`} className="flex gap-2 text-[11px] font-mono">
                    <span className="shrink-0 text-muted-foreground">
                      {new Date(log.timestamp).toISOString().slice(11, 23)}
                    </span>
                    <span className={`shrink-0 uppercase ${LOG_COLORS[log.level] ?? ""}`}>{log.level}</span>
                    <span className="break-all">{log.message}</span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
