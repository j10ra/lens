import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";

export type TraceRow = {
  trace_id: string;
  name: string;
  started_at: number;
  duration_ms: number;
  span_count: number;
  error_count: number;
};

export type SpanRow = {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  name: string;
  started_at: number;
  duration_ms: number;
  error_message: string | null;
};

export function useTraces(limit?: number) {
  return useQuery<TraceRow[]>({
    queryKey: ["traces", limit],
    queryFn: () => api.traces(limit),
    refetchInterval: 5_000,
  });
}

export function useTraceSpans(traceId: string | null) {
  return useQuery<{ traceId: string; spans: SpanRow[] }>({
    queryKey: ["trace-spans", traceId],
    queryFn: () => api.traceSpans(traceId!),
    enabled: !!traceId,
  });
}
