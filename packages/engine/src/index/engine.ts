import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { lensFn } from "@lens/core";
import type { Db } from "../db/connection.js";
import { chunkQueries, repoQueries } from "../db/queries.js";
import { chunkFile } from "./chunker.js";
import { diffScan, fullScan, getHeadCommit } from "./discovery.js";
import { extractAndPersistMetadata } from "./extract-metadata.js";
import { analyzeGitHistory } from "./git-analysis.js";
import { buildAndPersistImportGraph } from "./import-graph.js";

// ── In-memory mutex ────────────────────────────────────────────────────────────
// Prevents concurrent indexing of the same repo. Different repos index concurrently.

const locks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  while (locks.has(key)) await locks.get(key);
  let resolve!: () => void;
  const p = new Promise<void>((r) => {
    resolve = r;
  });
  locks.set(key, p);
  try {
    return await fn();
  } finally {
    locks.delete(key);
    resolve();
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface IndexResult {
  files_scanned: number;
  chunks_created: number;
  duration_ms: number;
  skipped: boolean;
}

// ── runIndex ───────────────────────────────────────────────────────────────────

export const runIndex = lensFn(
  "engine.runIndex",
  async (db: Db, repoId: string, force = false): Promise<IndexResult> => {
    return withLock(repoId, async () => {
      const start = Date.now();

      // 1. Get repo — throw if not found
      const repo = repoQueries.getById(db, repoId);
      if (!repo) throw new Error(`Repo not found: ${repoId}`);

      // 2. Get HEAD commit
      const headCommit = await getHeadCommit(repo.root_path);

      // 3. Early exit if HEAD unchanged (unless force)
      if (!force && repo.last_indexed_commit === headCommit) {
        return { files_scanned: 0, chunks_created: 0, duration_ms: Date.now() - start, skipped: true };
      }

      // 4. Transition to indexing state
      repoQueries.setIndexing(db, repoId);

      // 5. Discovery — full scan on first run or force, diff scan otherwise
      const isFullScan = force || !repo.last_indexed_commit;
      const files = isFullScan
        ? await fullScan(repo.root_path)
        : await diffScan(repo.root_path, repo.last_indexed_commit!, headCommit);

      // 6. Chunking + storage — skip deleted files
      let chunksCreated = 0;
      for (const file of files) {
        if (file.status === "deleted") continue;

        let content: string;
        try {
          content = await readFile(join(repo.root_path, file.path), "utf-8");
        } catch {
          // File removed between discovery and read — skip
          continue;
        }

        const chunks = chunkFile(content, file.path);
        chunkQueries.upsertChunks(
          db,
          repoId,
          file.path,
          chunks.map((c) => ({
            chunkIndex: c.chunkIndex,
            startLine: c.startLine,
            endLine: c.endLine,
            content: c.content,
            chunkHash: c.chunkHash,
            lastSeenCommit: headCommit,
            language: file.language,
          })),
        );
        chunksCreated += chunks.length;
      }

      // 7. Metadata extraction
      extractAndPersistMetadata(db, repoId);

      // 8. Import graph
      buildAndPersistImportGraph(db, repoId);

      // 9. Git analysis (incremental — pass last_git_analysis_commit as sinceCommit)
      await analyzeGitHistory(db, repoId, repo.root_path, repo.last_git_analysis_commit);

      // 10. Finalize — mark ready, record HEAD
      repoQueries.updateIndexState(db, repoId, headCommit, "ready");

      return {
        files_scanned: files.length,
        chunks_created: chunksCreated,
        duration_ms: Date.now() - start,
        skipped: false,
      };
    });
  },
);
