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
    console.log(`[RLM] Index complete, starting embeddings...`);
    await ensureEmbedded(repoId);
    console.log(`[RLM] Embeddings complete for ${name}`);
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
  summaries_removed: number;
  traces_removed: number;
}

export const remove = api(
  { expose: true, method: "DELETE", path: "/repo/:id" },
  async ({ id }: DeleteParams): Promise<DeleteResponse> => {
    // Stop watcher first to prevent writes during deletion
    await stopWatcher(id);

    // Count before delete
    const counts = await db.queryRow<{
      chunks: number;
      summaries: number;
      traces: number;
    }>`
      SELECT
        (SELECT count(*)::int FROM chunks WHERE repo_id = ${id}) AS chunks,
        (SELECT count(*)::int FROM summaries WHERE repo_id = ${id}) AS summaries,
        (SELECT count(*)::int FROM traces WHERE repo_id = ${id}) AS traces
    `;

    // Delete explicitly in batches to avoid slow CASCADE with pgvector
    // Order: traces → summaries → chunks → repo (respects FK dependencies)
    await db.exec`DELETE FROM traces WHERE repo_id = ${id}`;
    await db.exec`DELETE FROM summaries WHERE repo_id = ${id}`;

    // Chunks with embeddings — delete in batches to avoid pgvector bottleneck
    let totalDeleted = 0;
    while (true) {
      const res = await db.queryRow<{ remaining: number }>`
        SELECT count(*)::int AS remaining FROM chunks WHERE repo_id = ${id} LIMIT 1001
      `;
      const remaining = res?.remaining ?? 0;
      if (remaining === 0) break;

      await db.exec`
        DELETE FROM chunks
        WHERE repo_id = ${id}
        AND id IN (
          SELECT id FROM chunks WHERE repo_id = ${id} LIMIT 1000
        )
      `;
      totalDeleted += Math.min(remaining, 1000);
    }

    // Finally delete the repo row
    const result = await db.queryRow<{ deleted: boolean }>`
      DELETE FROM repos WHERE id = ${id} RETURNING true AS deleted
    `;

    if (!result?.deleted) throw APIError.notFound("repo not found");

    return {
      deleted: true,
      chunks_removed: counts?.chunks ?? 0,
      summaries_removed: counts?.summaries ?? 0,
      traces_removed: counts?.traces ?? 0,
    };
  },
);

// --- Daemon Stats ---

interface DaemonStats {
  repos_count: number;
  total_chunks: number;
  total_embeddings: number;
  total_summaries: number;
  total_traces: number;
  db_size_mb: number;
}

export const daemonStats = api(
  { expose: true, method: "GET", path: "/daemon/stats" },
  async (): Promise<DaemonStats> => {
    const row = await db.queryRow<{
      repos_count: number;
      total_chunks: number;
      total_embeddings: number;
      total_summaries: number;
      total_traces: number;
      db_size_mb: number;
    }>`
      SELECT
        (SELECT count(*)::int FROM repos) AS repos_count,
        (SELECT count(*)::int FROM chunks) AS total_chunks,
        (SELECT count(*) FILTER (WHERE embedding IS NOT NULL)::int FROM chunks) AS total_embeddings,
        (SELECT count(*)::int FROM summaries) AS total_summaries,
        (SELECT count(*)::int FROM traces) AS total_traces,
        (SELECT pg_database_size(current_database()) / 1048576)::int AS db_size_mb
    `;

    return {
      repos_count: row?.repos_count ?? 0,
      total_chunks: row?.total_chunks ?? 0,
      total_embeddings: row?.total_embeddings ?? 0,
      total_summaries: row?.total_summaries ?? 0,
      total_traces: row?.total_traces ?? 0,
      db_size_mb: row?.db_size_mb ?? 0,
    };
  },
);

// --- Status ---

interface StatusParams {
  id: string;
}

interface StatusResponse {
  indexed_commit: string | null;
  current_head: string | null;
  is_stale: boolean;
  chunk_count: number;
  files_indexed: number;
  embedded_count: number;
  embedded_pct: number;
  summary_count: number;
  embedder: string;
  embedding_dim: number;
  last_activity: string | null;
  trace_count: number;
}

// --- Template ---

interface TemplateResponse {
  content: string;
}

export const template = api(
  { expose: true, method: "GET", path: "/repo/template" },
  async (): Promise<TemplateResponse> => {
    return {
      content: `## RLM — Repo Context Daemon

Available when native search returns too many results or for orientation in unfamiliar repos.

- \`rlm search "<query>"\` — hybrid grep+semantic code search
- \`rlm read <path>\` — read full file via daemon
- \`rlm task "<goal>"\` — compressed context pack (repo map + relevant files)
- \`rlm run "<cmd>"\` — sandboxed test/build (npm, cargo, python, git)
`
    };
  },
);

// --- Status ---

interface StatusParams {
  id: string;
}

interface StatusResponse {
  indexed_commit: string | null;
  current_head: string | null;
  is_stale: boolean;
  chunk_count: number;
  files_indexed: number;
  embedded_count: number;
  embedded_pct: number;
  summary_count: number;
  embedder: string;
  embedding_dim: number;
  last_activity: string | null;
  trace_count: number;
}

export const status = api(
  { expose: true, method: "GET", path: "/repo/:id/status" },
  async ({ id }: StatusParams): Promise<StatusResponse> => {
    const repo = await db.queryRow<{
      root_path: string;
      last_indexed_commit: string | null;
    }>`SELECT root_path, last_indexed_commit FROM repos WHERE id = ${id}`;
    if (!repo) throw APIError.notFound("repo not found");

    let currentHead: string | null = null;
    try {
      currentHead = await getHeadCommit(repo.root_path);
    } catch { /* repo may not be a git dir */ }

    const isStale = !!(currentHead && repo.last_indexed_commit !== currentHead);

    const stats = await db.queryRow<{
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
                         'java','kotlin','csharp','cpp','c','swift','php','shell'))::int AS embeddable_count
      FROM chunks WHERE repo_id = ${id}
    `;

    const summaryRow = await db.queryRow<{ count: number }>`
      SELECT count(*)::int AS count FROM summaries
      WHERE repo_id = ${id} AND level = 'file'
    `;

    const traceStats = await db.queryRow<{
      trace_count: number;
      last_activity: string | null;
    }>`
      SELECT
        count(*)::int AS trace_count,
        max(to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) AS last_activity
      FROM traces
      WHERE repo_id = ${id}
        AND created_at > now() - interval '30 minutes'
    `;

    const chunkCount = stats?.chunk_count ?? 0;
    const embeddedCount = stats?.embedded_count ?? 0;
    const embeddableCount = stats?.embeddable_count ?? 0;

    return {
      indexed_commit: repo.last_indexed_commit,
      current_head: currentHead,
      is_stale: isStale,
      chunk_count: chunkCount,
      files_indexed: stats?.files_indexed ?? 0,
      embedded_count: embeddedCount,
      embedded_pct: embeddableCount > 0 ? Math.round((embeddedCount / embeddableCount) * 100) : 0,
      summary_count: summaryRow?.count ?? 0,
      embedder: EMBEDDING_MODEL,
      embedding_dim: EMBEDDING_DIM,
      last_activity: traceStats?.last_activity ?? null,
      trace_count: traceStats?.trace_count ?? 0,
    };
  },
);
