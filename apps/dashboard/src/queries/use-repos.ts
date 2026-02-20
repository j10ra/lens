import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";

export type Repo = {
  id: string;
  name: string;
  root_path: string;
  remote_url: string | null;
  index_status: string;
  last_indexed_at: string | null;
  last_indexed_commit: string | null;
  created_at: string;
  file_count: number;
};

export type RepoStats = {
  languages: { language: string; count: number }[];
  import_edges: number;
};

export function useRepos() {
  return useQuery<Repo[]>({
    queryKey: ["repos"],
    queryFn: () => api.repos(),
    refetchInterval: 10_000,
  });
}

export function useRepoStats(repoId: string | undefined) {
  return useQuery<RepoStats>({
    queryKey: ["repo-stats", repoId],
    queryFn: () => api.repoStats(repoId!),
    enabled: !!repoId,
  });
}
