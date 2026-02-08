// Repo management endpoints — register, get, list, listDetailed, remove, status, daemonStats
// Entry point for onboarding repos. Registration triggers initial index + embed + watcher.

import { api, APIError } from "encore.dev/api";
import { db } from "./db";
import { deriveIdentityKey } from "./lib/identity";
import { getHeadCommit } from "../index/lib/discovery";
import { EMBEDDING_MODEL, EMBEDDING_DIM } from "../index/lib/search-config";
import { runIndex } from "../index/lib/engine";
import { ensureEmbedded } from "../index/lib/embed";
import { startWatcher, stopWatcher } from "../index/lib/watcher";
import { purposeModelState, enrichPurpose } from "../index/lib/enrich-purpose";
import { maintenanceState } from "../index/worker";

// --- Types ---

interface RegisterParams {
  root_path: string;
  name?: string;
  remote_url?: string;
}

interface RegisterResponse {
  repo_id: string;
  identity_key: string;
  name: string;
  created: boolean;
}

interface RepoRow {
  id: string;
  identity_key: string;
  name: string;
  root_path: string;
  remote_url: string | null;
  created_at: Date;
  updated_at: Date;
}

interface GetParams {
  id: string;
}

interface ListResponse {
  repos: RepoRow[];
}

// --- Helpers ---

async function indexAndEmbed(repoId: string, name: string, rootPath: string) {
  try {
    console.log(`[RLM] Starting indexing for ${name}...`);
    await runIndex(repoId);
    console.log(`[RLM] Index complete, starting embeddings + purpose summaries...`);
    await Promise.all([ensureEmbedded(repoId), enrichPurpose(repoId)]);
    console.log(`[RLM] Embeddings + purpose summaries complete for ${name}`);
    startWatcher(repoId, rootPath);
  } catch (err) {
    console.error(`[RLM] Indexing failed for ${name}:`, err);
  }
}

// --- Endpoints ---

export const register = api(
  { expose: true, method: "POST", path: "/repo/register" },
  async (params: RegisterParams): Promise<RegisterResponse> => {
    const identityKey = deriveIdentityKey(params.root_path, params.remote_url);
    const name = params.name ?? params.root_path.split("/").pop() ?? "unknown";

    const row = await db.queryRow<{ id: string; created: boolean }>`
      INSERT INTO repos (identity_key, name, root_path, remote_url)
      VALUES (${identityKey}, ${name}, ${params.root_path}, ${params.remote_url ?? null})
      ON CONFLICT (identity_key) DO UPDATE
        SET root_path = EXCLUDED.root_path,
            remote_url = COALESCE(EXCLUDED.remote_url, repos.remote_url),
            updated_at = now()
      RETURNING id, (xmax = 0) AS created
    `;

    if (!row) throw APIError.internal("failed to upsert repo");

    if (row.created) {
      // Fire-and-forget — CLI polls /repo/:id/status for progress
      indexAndEmbed(row.id, name, params.root_path);
    }

    return {
      repo_id: row.id,
      identity_key: identityKey,
      name,
      created: row.created,
    };
  },
);

export const get = api(
  { expose: true, method: "GET", path: "/repo/:id" },
  async ({ id }: GetParams): Promise<RepoRow> => {
    const row = await db.queryRow<RepoRow>`
      SELECT id, identity_key, name, root_path, remote_url, created_at, updated_at
      FROM repos WHERE id = ${id}
    `;
    if (!row) throw APIError.notFound("repo not found");
    return row;
  },
);

export const list = api(
  { expose: true, method: "GET", path: "/repo/list" },
  async (): Promise<ListResponse> => {
    const rows = db.query<RepoRow>`
      SELECT id, identity_key, name, root_path, remote_url, created_at, updated_at
      FROM repos ORDER BY created_at DESC
    `;
    const repos: RepoRow[] = [];
    for await (const row of rows) {
      repos.push(row);
    }
    return { repos };
  },
);

// --- List Detailed ---

interface RepoDetail {
  id: string;
  name: string;
  root_path: string;
  index_status: string;
  chunk_count: number;
  files_indexed: number;
  embedded_pct: number;
  last_indexed_at: string | null;
}

interface ListDetailedResponse {
  repos: RepoDetail[];
}

export const listDetailed = api(
  { expose: true, method: "GET", path: "/repo/list/detailed" },
  async (): Promise<ListDetailedResponse> => {
    const rows: RepoDetail[] = [];
    const cursor = db.query<RepoDetail>`
      SELECT
        r.id, r.name, r.root_path,
        r.index_status,
        (SELECT count(*)::int FROM chunks WHERE repo_id = r.id) AS chunk_count,
        (SELECT count(DISTINCT path)::int FROM chunks WHERE repo_id = r.id) AS files_indexed,
        CASE
          WHEN (SELECT count(*) FROM chunks WHERE repo_id = r.id) = 0 THEN 0
          ELSE (SELECT count(*) FILTER (WHERE embedding IS NOT NULL) * 100 / count(*) FROM chunks WHERE repo_id = r.id)::int
        END AS embedded_pct,
        to_char(r.last_indexed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_indexed_at
      FROM repos r
      ORDER BY r.created_at DESC
    `;
    for await (const row of cursor) {
      rows.push(row);
    }
    return { repos: rows };
  },
);

// --- Delete ---

interface DeleteParams {
  id: string;
}

interface DeleteResponse {
  deleted: boolean;
  chunks_removed: number;
}

export const remove = api(
  { expose: true, method: "DELETE", path: "/repo/:id" },
  async ({ id }: DeleteParams): Promise<DeleteResponse> => {
    // Stop watcher first to prevent writes during deletion
    await stopWatcher(id);

    // Count before delete
    const counts = await db.queryRow<{
      chunks: number;
    }>`
      SELECT
        (SELECT count(*)::int FROM chunks WHERE repo_id = ${id}) AS chunks
    `;

    // Delete explicitly to avoid slow CASCADE with pgvector
    await db.exec`DELETE FROM file_cochanges WHERE repo_id = ${id}`;
    await db.exec`DELETE FROM file_stats WHERE repo_id = ${id}`;
    await db.exec`DELETE FROM file_imports WHERE repo_id = ${id}`;
    await db.exec`DELETE FROM file_metadata WHERE repo_id = ${id}`;
    await db.exec`DELETE FROM summaries WHERE repo_id = ${id}`;

    // Chunks with embeddings — delete in batches to avoid pgvector bottleneck
    while (true) {
      const res = await db.queryRow<{ remaining: number }>`
        SELECT count(*)::int AS remaining FROM chunks WHERE repo_id = ${id} LIMIT 1001
      `;
      if ((res?.remaining ?? 0) === 0) break;

      await db.exec`
        DELETE FROM chunks
        WHERE repo_id = ${id}
        AND id IN (
          SELECT id FROM chunks WHERE repo_id = ${id} LIMIT 1000
        )
      `;
    }

    // Finally delete the repo row
    const result = await db.queryRow<{ deleted: boolean }>`
      DELETE FROM repos WHERE id = ${id} RETURNING true AS deleted
    `;

    if (!result?.deleted) throw APIError.notFound("repo not found");

    return {
      deleted: true,
      chunks_removed: counts?.chunks ?? 0,
    };
  },
);

// --- Daemon Stats ---

interface DaemonStats {
  repos_count: number;
  total_chunks: number;
  total_embeddings: number;
  total_summaries: number;
  db_size_mb: number;
  last_maintenance_at: string | null;
  next_maintenance_at: string | null;
  last_maintenance_result: { processed: number; errors: number } | null;
}

export const daemonStats = api(
  { expose: true, method: "GET", path: "/daemon/stats" },
  async (): Promise<DaemonStats> => {
    const row = await db.queryRow<{
      repos_count: number;
      total_chunks: number;
      total_embeddings: number;
      total_summaries: number;
      db_size_mb: number;
    }>`
      SELECT
        (SELECT count(*)::int FROM repos) AS repos_count,
        (SELECT count(*)::int FROM chunks) AS total_chunks,
        (SELECT count(*) FILTER (WHERE embedding IS NOT NULL)::int FROM chunks) AS total_embeddings,
        (SELECT count(*)::int FROM summaries) AS total_summaries,
        (SELECT pg_database_size(current_database()) / 1048576)::int AS db_size_mb
    `;

    const lastRun = maintenanceState.last_run_at;
    const nextRun = lastRun ? new Date(lastRun.getTime() + 5 * 60_000) : null;

    return {
      repos_count: row?.repos_count ?? 0,
      total_chunks: row?.total_chunks ?? 0,
      total_embeddings: row?.total_embeddings ?? 0,
      total_summaries: row?.total_summaries ?? 0,
      db_size_mb: row?.db_size_mb ?? 0,
      last_maintenance_at: lastRun?.toISOString() ?? null,
      next_maintenance_at: nextRun?.toISOString() ?? null,
      last_maintenance_result: maintenanceState.last_result,
    };
  },
);

// --- Template ---

interface TemplateResponse {
  content: string;
}

export const template = api(
  { expose: true, method: "GET", path: "/repo/template" },
  async (): Promise<TemplateResponse> => {
    return {
      content: `## RLM — Repo Context Daemon
\`rlm context "<goal>"\` — dependency graph, co-changes, file activity, cross-layer file discovery
`
    };
  },
);

// --- Status ---

interface StatusParams {
  id: string;
}

interface StatusResponse {
  index_status: string;
  indexed_commit: string | null;
  current_head: string | null;
  is_stale: boolean;
  chunk_count: number;
  files_indexed: number;
  embedded_count: number;
  embeddable_count: number;
  embedded_pct: number;
  embedder: string;
  embedding_dim: number;
  metadata_count: number;
  import_edge_count: number;
  git_commits_analyzed: number;
  cochange_pairs: number;
  purpose_count: number;
  purpose_total: number;
  purpose_model_status: string;
  purpose_model_progress: number;
}

export const status = api(
  { expose: true, method: "GET", path: "/repo/:id/status" },
  async ({ id }: StatusParams): Promise<StatusResponse> => {
    const repo = await db.queryRow<{
      root_path: string;
      last_indexed_commit: string | null;
      index_status: string;
    }>`SELECT root_path, last_indexed_commit, index_status FROM repos WHERE id = ${id}`;
    if (!repo) throw APIError.notFound("repo not found");

    let currentHead: string | null = null;
    try {
      currentHead = await getHeadCommit(repo.root_path);
    } catch { /* repo may not be a git dir */ }

    const isStale = !!(currentHead && repo.last_indexed_commit !== currentHead);

    const [stats, structuralStats] = await Promise.all([
      db.queryRow<{
        chunk_count: number;
        files_indexed: number;
        embedded_count: number;
        embeddable_count: number;
      }>`
        SELECT
          count(*)::int AS chunk_count,
          count(DISTINCT path)::int AS files_indexed,
          count(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded_count,
          count(*) FILTER (WHERE language IN ('typescript','javascript','python','ruby','go','rust',
                           'java','kotlin','csharp','cpp','c','swift','php','shell')
                           AND content IS NOT NULL AND trim(content) != '')::int AS embeddable_count
        FROM chunks WHERE repo_id = ${id}
      `,
      db.queryRow<{
        metadata_count: number;
        import_edge_count: number;
        git_file_count: number;
        cochange_pairs: number;
        purpose_count: number;
      }>`
        SELECT
          (SELECT count(*)::int FROM file_metadata WHERE repo_id = ${id}) AS metadata_count,
          (SELECT count(*)::int FROM file_imports WHERE repo_id = ${id}) AS import_edge_count,
          (SELECT count(*)::int FROM file_stats WHERE repo_id = ${id}) AS git_file_count,
          (SELECT count(*)::int FROM file_cochanges WHERE repo_id = ${id}) AS cochange_pairs,
          (SELECT count(*) FILTER (WHERE purpose != '' AND purpose IS NOT NULL)::int FROM file_metadata WHERE repo_id = ${id}) AS purpose_count
      `,
    ]);

    const chunkCount = stats?.chunk_count ?? 0;
    const embeddedCount = stats?.embedded_count ?? 0;
    const embeddableCount = stats?.embeddable_count ?? 0;

    const metadataCount = structuralStats?.metadata_count ?? 0;

    return {
      index_status: repo.index_status,
      indexed_commit: repo.last_indexed_commit,
      current_head: currentHead,
      is_stale: isStale,
      chunk_count: chunkCount,
      files_indexed: stats?.files_indexed ?? 0,
      embedded_count: embeddedCount,
      embeddable_count: embeddableCount,
      embedded_pct: embeddableCount > 0 ? Math.round((embeddedCount / embeddableCount) * 100) : 0,
      embedder: EMBEDDING_MODEL,
      embedding_dim: EMBEDDING_DIM,
      metadata_count: metadataCount,
      import_edge_count: structuralStats?.import_edge_count ?? 0,
      git_commits_analyzed: structuralStats?.git_file_count ?? 0,
      cochange_pairs: structuralStats?.cochange_pairs ?? 0,
      purpose_count: structuralStats?.purpose_count ?? 0,
      purpose_total: metadataCount,
      purpose_model_status: purposeModelState.status,
      purpose_model_progress: purposeModelState.progress,
    };
  },
);
