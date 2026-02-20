import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";

export type TraceRow = {
  trace_id: string;
  root_span_name: string;
  source: string;
  started_at: number;
  ended_at: number;
  duration_ms: number;
};

export type SpanRow = {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  started_at: number;
  duration_ms: number;
  error_message: string | null;
  input: string | null;
  output: string | null;
};

export type LogRow = {
  trace_id: string;
  span_id: string | null;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  timestamp: number;
};

export function useTraces(sources?: string[]) {
  return useQuery<TraceRow[]>({
    queryKey: ["traces", sources],
    queryFn: () => api.traces(undefined, sources),
    refetchInterval: 5_000,
  });
}

export function useTraceSpans(traceId: string | null) {
  return useQuery<{ traceId: string; spans: SpanRow[]; logs: LogRow[] }>({
    queryKey: ["trace-spans", traceId],
    queryFn: () => api.traceSpans(traceId!),
    enabled: !!traceId,
  });
}
