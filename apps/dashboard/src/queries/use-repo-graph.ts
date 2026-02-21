import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { FileNeighborhood, GraphDetail, GraphOverview, GraphSummary } from "../lib/graph-types.js";

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

export function useGraphOverview(repoPath: string | undefined, dir?: string, limit?: number) {
  return useQuery<GraphOverview>({
    queryKey: ["graph-overview", repoPath, dir ?? null, limit ?? null],
    queryFn: () => api.repoGraphOverview(repoPath!, dir, limit),
    enabled: !!repoPath,
  });
}

export function useGraphNeighbors(repoPath: string | undefined, filePath: string | null) {
  return useQuery<FileNeighborhood>({
    queryKey: ["graph-neighbors", repoPath, filePath],
    queryFn: () => api.graphNeighbors(repoPath!, filePath!),
    enabled: !!repoPath && !!filePath,
  });
}
