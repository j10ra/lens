import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { GraphDetail, GraphSummary } from "../lib/graph-types.js";

export function useGraphSummary(repoPath: string | undefined) {
  return useQuery<GraphSummary>({
    queryKey: ["graph-summary", repoPath],
    queryFn: () => api.repoGraph(repoPath!),
    enabled: !!repoPath,
  });
}

export function useGraphDetail(repoPath: string | undefined, dir?: string) {
  return useQuery<GraphDetail>({
    queryKey: ["graph-detail", repoPath, dir ?? null],
    queryFn: () => api.repoGraph(repoPath!, dir),
    enabled: !!repoPath,
  });
}
