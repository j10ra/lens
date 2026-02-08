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

// --- POST /index/recompute-depth ---

export const recomputeDepth = api(
  { expose: true, method: "POST", path: "/index/recompute-depth" },
  async ({ repo_id }: { repo_id: string }): Promise<{ max_import_depth: number }> => {
    const depth = await computeImportDepthBFS(repo_id);
    await db.exec`UPDATE repos SET max_import_depth = ${depth} WHERE id = ${repo_id}`;
    return { max_import_depth: depth };
  },
);

/** BFS from leaves (imported but never import) upward. Tracks visited to handle cycles. */
async function computeImportDepthBFS(repoId: string): Promise<number> {
  // Load full graph into memory
  const fwd = new Map<string, string[]>(); // source → targets
  const allSources = new Set<string>();
  const allTargets = new Set<string>();

  const rows = db.query<{ source_path: string; target_path: string }>`
    SELECT source_path, target_path FROM file_imports WHERE repo_id = ${repoId}
  `;
  for await (const r of rows) {
    allSources.add(r.source_path);
    allTargets.add(r.target_path);
    const list = fwd.get(r.source_path) ?? [];
    list.push(r.target_path);
    fwd.set(r.source_path, list);
  }

  if (allSources.size === 0) return 0;

  // Build reverse graph: target → sources (who imports it)
  const rev = new Map<string, string[]>();
  for (const [src, targets] of fwd) {
    for (const t of targets) {
      const list = rev.get(t) ?? [];
      list.push(src);
      rev.set(t, list);
    }
  }

  // Leaves: files that are imported but don't import anything
  const leaves: string[] = [];
  for (const t of allTargets) {
    if (!allSources.has(t)) leaves.push(t);
  }
  if (leaves.length === 0) return 1; // all files in cycles

  // BFS upward from leaves
  let maxDepth = 0;
  const visited = new Set<string>();
  let frontier = leaves;
  let depth = 0;
  for (const l of leaves) visited.add(l);

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const node of frontier) {
      const importers = rev.get(node) ?? [];
      for (const imp of importers) {
        if (!visited.has(imp)) {
          visited.add(imp);
          next.push(imp);
        }
      }
    }
    if (next.length > 0) {
      depth++;
      maxDepth = depth;
    }
    frontier = next;
  }
  return maxDepth;
}

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
