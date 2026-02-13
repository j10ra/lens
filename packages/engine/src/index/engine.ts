import { readFile } from "node:fs/promises";
import type { Capabilities } from "../capabilities";
import type { Db } from "../db/connection";
import { chunkQueries, importQueries, metadataQueries, repoQueries } from "../db/queries";
import { track } from "../telemetry";
import type { RequestTrace } from "../trace";
import type { IndexResult } from "../types";
import { chunkFile, DEFAULT_CHUNKING_PARAMS } from "./chunker";
import { type DiscoveredFile, diffScan, fullScan, getHeadCommit } from "./discovery";
import { extractAndPersistMetadata } from "./extract-metadata";
import { analyzeGitHistory } from "./git-analysis";
import { buildAndPersistImportGraph } from "./import-graph";

const MAX_CHUNKS_PER_REPO = 100_000;

// In-memory mutex (replaces pg_advisory_lock)
const locks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  while (locks.has(key)) {
    await locks.get(key);
  }
  let resolve: () => void;
  const p = new Promise<void>((r) => {
    resolve = r;
  });
  locks.set(key, p);
  try {
    return await fn();
  } finally {
    locks.delete(key);
    resolve!();
  }
}

export async function runIndex(
  db: Db,
  repoId: string,
  _caps?: Capabilities,
  force = false,
  onProgress?: () => void,
  trace?: RequestTrace,
): Promise<IndexResult> {
  return withLock(repoId, async () => {
    const start = Date.now();

    const repo = repoQueries.getById(db, repoId);
    if (!repo) throw new Error("repo not found");

    const headCommit = await getHeadCommit(repo.root_path);

    if (!force && repo.last_indexed_commit === headCommit) {
      return {
        files_scanned: 0,
        chunks_created: 0,
        chunks_unchanged: 0,
        chunks_deleted: 0,
        duration_ms: Date.now() - start,
      };
    }

    repoQueries.setIndexing(db, repoId);

    trace?.step("discovery");
    let files: DiscoveredFile[];
    if (!force && repo.last_indexed_commit) {
      files = await diffScan(repo.root_path, repo.last_indexed_commit, headCommit);
    } else {
      files = await fullScan(repo.root_path);
    }
    trace?.end("discovery", `${files.length} files`);

    trace?.step("chunking");
    let currentChunks = chunkQueries.countByRepo(db, repoId);
    let chunksCreated = 0;
    let chunksUnchanged = 0;
    let chunksDeleted = 0;

    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      if (file.status === "deleted") {
        chunksDeleted += chunkQueries.deleteByRepoPath(db, repoId, file.path);
        continue;
      }

      let content: string;
      try {
        content = await readFile(file.absolute_path, "utf-8");
      } catch {
        continue;
      }
      content = content.replaceAll("\x00", "");

      const newChunks = chunkFile(content, DEFAULT_CHUNKING_PARAMS);

      const existing = new Map<string, string>();
      for (const row of chunkQueries.getByRepoPath(db, repoId, file.path)) {
        existing.set(`${row.chunk_index}:${row.chunk_hash}`, row.id);
      }

      const newKeys = new Set<string>();
      for (const chunk of newChunks) {
        const key = `${chunk.chunk_index}:${chunk.chunk_hash}`;
        newKeys.add(key);

        if (existing.has(key)) {
          chunksUnchanged++;
          chunkQueries.updateLastSeen(db, existing.get(key)!, repoId, headCommit);
        } else {
          if (currentChunks >= MAX_CHUNKS_PER_REPO) continue;
          chunksCreated++;
          currentChunks++;
          chunkQueries.upsert(
            db,
            repoId,
            file.path,
            chunk.chunk_index,
            chunk.start_line,
            chunk.end_line,
            chunk.content,
            chunk.chunk_hash,
            headCommit,
            file.language,
          );
        }
      }

      for (const [key, id] of existing) {
        if (!newKeys.has(key)) {
          chunkQueries.deleteById(db, id, repoId);
          chunksDeleted++;
        }
      }
    }

    // On full scan, prune chunks for paths no longer in git
    const isFullScan = force || !repo.last_indexed_commit;
    if (isFullScan) {
      const scannedPaths = new Set(files.map((f) => f.path));
      const allChunkPaths = new Set(chunkQueries.getAllByRepo(db, repoId).map((c) => c.path));
      for (const path of allChunkPaths) {
        if (!scannedPaths.has(path)) {
          chunksDeleted += chunkQueries.deleteByRepoPath(db, repoId, path);
        }
      }
    }

    trace?.end("chunking", `+${chunksCreated} -${chunksDeleted}`);
    onProgress?.();

    trace?.step("extractMetadata");
    extractAndPersistMetadata(db, repoId);
    // Prune orphan metadata (paths with no chunks — e.g. stale dist/node_modules entries)
    if (isFullScan) {
      const scannedPaths = new Set(files.map((f) => f.path));
      const allMeta = metadataQueries.getByRepo(db, repoId);
      for (const m of allMeta) {
        if (!scannedPaths.has(m.path)) {
          metadataQueries.deleteByPath(db, repoId, m.path);
        }
      }
    }
    trace?.end("extractMetadata");
    onProgress?.();

    trace?.step("importGraph");
    buildAndPersistImportGraph(db, repoId);
    computeMaxImportDepth(db, repoId);
    trace?.end("importGraph");
    onProgress?.();

    trace?.step("gitAnalysis");
    await analyzeGitHistory(db, repoId, repo.root_path, repo.last_git_analysis_commit);
    trace?.end("gitAnalysis");
    onProgress?.();

    repoQueries.updateIndexState(db, repoId, headCommit, "ready");
    onProgress?.();

    const result: IndexResult = {
      files_scanned: files.length,
      chunks_created: chunksCreated,
      chunks_unchanged: chunksUnchanged,
      chunks_deleted: chunksDeleted,
      duration_ms: Date.now() - start,
    };

    track(db, "index", {
      file_count: result.files_scanned,
      chunk_count: result.chunks_created,
      duration_ms: result.duration_ms,
    });

    return result;
  });
}

export function computeMaxImportDepth(db: Db, repoId: string): void {
  const allEdges = importQueries.getByRepo(db, repoId);
  const allSources = new Set<string>();
  const allTargets = new Set<string>();
  const rev = new Map<string, string[]>();

  for (const r of allEdges) {
    allSources.add(r.source_path);
    allTargets.add(r.target_path);
    const list = rev.get(r.target_path) ?? [];
    list.push(r.source_path);
    rev.set(r.target_path, list);
  }

  const leaves: string[] = [];
  for (const t of allTargets) {
    if (!allSources.has(t)) leaves.push(t);
  }

  let maxDepth = allSources.size > 0 && leaves.length === 0 ? 1 : 0;
  const visited = new Set<string>(leaves);
  let frontier = leaves;
  let depth = 0;

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const imp of rev.get(node) ?? []) {
        if (!visited.has(imp)) {
          visited.add(imp);
          next.push(imp);
        }
      }
    }
    if (next.length > 0) maxDepth = ++depth;
    frontier = next;
  }

  repoQueries.updateMaxDepth(db, repoId, maxDepth);
}

export async function ensureIndexed(db: Db, repoId: string, caps?: Capabilities): Promise<IndexResult | null> {
  const repo = repoQueries.getById(db, repoId);
  if (!repo) throw new Error("repo not found");

  const head = await getHeadCommit(repo.root_path);
  if (repo.last_indexed_commit === head) return null;

  return runIndex(db, repoId, caps);
}
