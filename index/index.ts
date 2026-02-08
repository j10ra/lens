// Index service endpoints — run, status, watchRepo, unwatchRepo, watchStatus
// Manages diff-aware file indexing and real-time file watchers per repo.

import { api, APIError } from "encore.dev/api";
import { db } from "../repo/db";
import { runIndex, type IndexResult } from "./lib/engine";
import { getHeadCommit } from "./lib/discovery";
import { ensureEmbedded } from "./lib/embed";
import { enrichPurpose } from "./lib/enrich-purpose";
import { startWatcher, stopWatcher, getWatcherStatus } from "./lib/watcher";

// --- POST /index/run ---

interface RunParams {
  repo_id: string;
  force?: boolean;
}

export const run = api(
  { expose: true, method: "POST", path: "/index/run" },
  async (params: RunParams): Promise<IndexResult> => {
    const result = await runIndex(params.repo_id, params.force ?? false);
    // Fire-and-forget: embeddings + purpose summaries in parallel
    Promise.all([ensureEmbedded(params.repo_id), enrichPurpose(params.repo_id, true)]).catch(() => {});
    return result;
  },
);

// --- GET /index/status/:repo_id ---

interface StatusParams {
  repo_id: string;
}

interface IndexStatus {
  index_status: string;
  last_indexed_commit: string | null;
  last_indexed_at: string | null;
  current_head: string | null;
  is_stale: boolean;
  chunk_count: number;
  files_indexed: number;
  chunks_with_embeddings: number;
}

export const status = api(
  { expose: true, method: "GET", path: "/index/status/:repo_id" },
  async ({ repo_id }: StatusParams): Promise<IndexStatus> => {
    const repo = await db.queryRow<{
      root_path: string;
      index_status: string;
      last_indexed_commit: string | null;
      last_indexed_at: Date | null;
    }>`SELECT root_path, index_status, last_indexed_commit, last_indexed_at FROM repos WHERE id = ${repo_id}`;

    if (!repo) throw APIError.notFound("repo not found");

    let currentHead: string | null = null;
    try {
      currentHead = await getHeadCommit(repo.root_path);
    } catch { /* repo path may not exist */ }

    const counts = await db.queryRow<{
      chunk_count: number;
      files_indexed: number;
      chunks_with_embeddings: number;
    }>`
      SELECT
        count(*)::int AS chunk_count,
        count(DISTINCT path)::int AS files_indexed,
        count(*) FILTER (WHERE embedding IS NOT NULL)::int AS chunks_with_embeddings
      FROM chunks WHERE repo_id = ${repo_id}
    `;

    return {
      index_status: repo.index_status,
      last_indexed_commit: repo.last_indexed_commit,
      last_indexed_at: repo.last_indexed_at?.toISOString() ?? null,
      current_head: currentHead,
      is_stale: currentHead !== null && currentHead !== repo.last_indexed_commit,
      chunk_count: counts?.chunk_count ?? 0,
      files_indexed: counts?.files_indexed ?? 0,
      chunks_with_embeddings: counts?.chunks_with_embeddings ?? 0,
    };
  },
);

// --- POST /index/watch ---

interface WatchParams {
  repo_id: string;
}

interface WatchResponse {
  started: boolean;
  already_watching: boolean;
}

export const watchRepo = api(
  { expose: true, method: "POST", path: "/index/watch" },
  async ({ repo_id }: WatchParams): Promise<WatchResponse> => {
    const repo = await db.queryRow<{ root_path: string }>`
      SELECT root_path FROM repos WHERE id = ${repo_id}
    `;
    if (!repo) throw APIError.notFound("repo not found");
    return startWatcher(repo_id, repo.root_path);
  },
);

// --- POST /index/unwatch ---

export const unwatchRepo = api(
  { expose: true, method: "POST", path: "/index/unwatch" },
  async ({ repo_id }: WatchParams): Promise<{ stopped: boolean }> => {
    return stopWatcher(repo_id);
  },
);

// --- GET /index/watch-status/:repo_id ---

interface WatchStatusResponse {
  watching: boolean;
  repo_root: string | null;
  changed_files: number;
  deleted_files: number;
  started_at: string | null;
}

export const watchStatus = api(
  { expose: true, method: "GET", path: "/index/watch-status/:repo_id" },
  async ({ repo_id }: WatchParams): Promise<WatchStatusResponse> => {
    return getWatcherStatus(repo_id);
  },
);
