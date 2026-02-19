import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";

export type RepoFile = {
  path: string;
  language: string | null;
  exports: string[] | null;
  chunk_count: number;
  row: number;
};

export type RepoFilesResult = {
  files: RepoFile[];
  total: number;
  offset: number;
  limit: number;
};

export type FileDetail = {
  path: string;
  language: string | null;
  exports: string[] | null;
  sections: string[] | null;
  internals: string[] | null;
  imports: string[] | null;
  imported_by: string[] | null;
  chunk_count: number;
  git_stats: {
    commits: number;
    recent_90d: number;
    last_modified: string | null;
    last_commit: string | null;
  } | null;
  cochanges: { path: string; count: number }[] | null;
};

export function useRepoFiles(repoId: string, params: { limit?: number; offset?: number; search?: string }) {
  return useQuery<RepoFilesResult>({
    queryKey: ["repo-files", repoId, params.offset, params.search],
    queryFn: () => api.repoFiles(repoId, params),
    enabled: !!repoId,
    placeholderData: keepPreviousData,
  });
}

export function useRepoFileDetail(repoId: string, filePath: string | null) {
  return useQuery<FileDetail>({
    queryKey: ["repo-file-detail", repoId, filePath],
    queryFn: () => api.repoFileDetail(repoId, filePath!),
    enabled: !!filePath,
  });
}
