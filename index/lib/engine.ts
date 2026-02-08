import { readFile } from "node:fs/promises";
import { db } from "../../repo/db";
import { fullScan, diffScan, getHeadCommit, type DiscoveredFile } from "./discovery";
import { chunkFile, DEFAULT_CHUNKING_PARAMS } from "./chunker";
import { extractAndPersistMetadata } from "./extract-metadata";
import { buildAndPersistImportGraph } from "./import-graph";
import { analyzeGitHistory } from "./git-analysis";

const MAX_CHUNKS_PER_REPO = 100_000;

export interface IndexResult {
  files_scanned: number;
  chunks_created: number;
  chunks_unchanged: number;
  chunks_deleted: number;
  duration_ms: number;
}

/** Run indexing for a repo. Diff-aware: only reprocess changed files. */
export async function runIndex(repoId: string, force = false): Promise<IndexResult> {
  const start = Date.now();

  const repo = await db.queryRow<{
    root_path: string;
    last_indexed_commit: string | null;
    last_git_analysis_commit: string | null;
  }>`SELECT root_path, last_indexed_commit, last_git_analysis_commit FROM repos WHERE id = ${repoId}`;

  if (!repo) throw new Error("repo not found");

  // Advisory lock (hash repo_id to int for pg_advisory_xact_lock)
  const lockId = hashToInt(repoId);
  await db.exec`SELECT pg_advisory_lock(${lockId})`;

  try {
    const headCommit = await getHeadCommit(repo.root_path);

    // Skip if already indexed at this commit
    if (!force && repo.last_indexed_commit === headCommit) {
      await db.exec`SELECT pg_advisory_unlock(${lockId})`;
      return { files_scanned: 0, chunks_created: 0, chunks_unchanged: 0, chunks_deleted: 0, duration_ms: Date.now() - start };
    }

    // Mark indexing
    await db.exec`UPDATE repos SET index_status = 'indexing' WHERE id = ${repoId}`;

    // Discover files
    let files: DiscoveredFile[];
    if (!force && repo.last_indexed_commit) {
      files = await diffScan(repo.root_path, repo.last_indexed_commit, headCommit);
    } else {
      files = await fullScan(repo.root_path);
    }

    // Check repo chunk limit
    const countRow = await db.queryRow<{ count: number }>`
      SELECT count(*)::int AS count FROM chunks WHERE repo_id = ${repoId}
    `;
    let currentChunks = countRow?.count ?? 0;

    let chunksCreated = 0;
    let chunksUnchanged = 0;
    let chunksDeleted = 0;

    for (const file of files) {
      if (file.status === "deleted") {
        const del = await db.queryRow<{ count: number }>`
          WITH deleted AS (
            DELETE FROM chunks WHERE repo_id = ${repoId} AND path = ${file.path} RETURNING 1
          ) SELECT count(*)::int AS count FROM deleted
        `;
        chunksDeleted += del?.count ?? 0;
        continue;
      }

      // Read + chunk the file
      let content: string;
      try {
        content = await readFile(file.absolute_path, "utf-8");
      } catch {
        continue;
      }

      const newChunks = chunkFile(content, DEFAULT_CHUNKING_PARAMS);

      // Get existing chunks for this file
      const existingRows = db.query<{ chunk_index: number; chunk_hash: string; id: string }>`
        SELECT id, chunk_index, chunk_hash FROM chunks
        WHERE repo_id = ${repoId} AND path = ${file.path}
        ORDER BY chunk_index
      `;
      const existing = new Map<string, string>(); // "index:hash" → id
      for await (const row of existingRows) {
        existing.set(`${row.chunk_index}:${row.chunk_hash}`, row.id);
      }

      const newKeys = new Set<string>();
      for (const chunk of newChunks) {
        const key = `${chunk.chunk_index}:${chunk.chunk_hash}`;
        newKeys.add(key);

        if (existing.has(key)) {
          // Unchanged — update last_seen_commit
          chunksUnchanged++;
          await db.exec`
            UPDATE chunks SET last_seen_commit = ${headCommit}, updated_at = now()
            WHERE id = ${existing.get(key)!} AND repo_id = ${repoId}
          `;
        } else {
          // New chunk — enforce per-repo limit
          if (currentChunks >= MAX_CHUNKS_PER_REPO) continue;
          chunksCreated++;
          currentChunks++;
          await db.exec`
            INSERT INTO chunks (repo_id, path, chunk_index, start_line, end_line, content, chunk_hash, last_seen_commit, language)
            VALUES (${repoId}, ${file.path}, ${chunk.chunk_index}, ${chunk.start_line}, ${chunk.end_line},
                    ${chunk.content}, ${chunk.chunk_hash}, ${headCommit}, ${file.language ?? null})
            ON CONFLICT (repo_id, path, chunk_index, chunk_hash) DO UPDATE
              SET last_seen_commit = EXCLUDED.last_seen_commit, updated_at = now()
          `;
        }
      }

      // Delete stale chunks for this file (old chunk_index/hash combos)
      for (const [key, id] of existing) {
        if (!newKeys.has(key)) {
          await db.exec`DELETE FROM chunks WHERE id = ${id} AND repo_id = ${repoId}`;
          chunksDeleted++;
        }
      }
    }

    // Structural analysis — all local, no API needed
    await extractAndPersistMetadata(repoId);
    await buildAndPersistImportGraph(repoId);
    await analyzeGitHistory(repoId, repo.root_path, repo.last_git_analysis_commit);

    // Update repo state
    await db.exec`
      UPDATE repos
      SET last_indexed_commit = ${headCommit},
          index_status = 'ready',
          last_indexed_at = now(),
          updated_at = now()
      WHERE id = ${repoId}
    `;

    return {
      files_scanned: files.length,
      chunks_created: chunksCreated,
      chunks_unchanged: chunksUnchanged,
      chunks_deleted: chunksDeleted,
      duration_ms: Date.now() - start,
    };
  } finally {
    await db.exec`SELECT pg_advisory_unlock(${lockId})`;
  }
}

/** Hash a UUID string to a stable 32-bit int for pg_advisory_lock */
function hashToInt(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash;
}
