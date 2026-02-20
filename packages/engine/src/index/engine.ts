import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { lensFn } from "@lens/core";
import type { Db } from "../db/connection.js";
import { metadataQueries, repoQueries } from "../db/queries.js";
import { diffScan, fullScan, getHeadCommit } from "./discovery.js";
import { extractAndPersistMetadata } from "./extract-metadata.js";
import { analyzeGitHistory } from "./git-analysis.js";
import { buildAndPersistImportGraph } from "./import-graph.js";

// ── In-memory mutex ────────────────────────────────────────────────────────────

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
  duration_ms: number;
  skipped: boolean;
}

// ── Core indexing logic (shared by runIndex and ensureIndex) ───────────────────

async function indexImpl(db: Db, repoId: string, force: boolean): Promise<IndexResult> {
  return withLock(repoId, async () => {
    const start = Date.now();

    const repo = repoQueries.getById(db, repoId);
    if (!repo) throw new Error(`Repo not found: ${repoId}`);

    const headCommit = await getHeadCommit(repo.root_path);

    const hasSymbols = metadataQueries.hasAnySymbols(db, repoId);
    const hasSymbolEligibleFiles = metadataQueries.hasAnySymbolEligibleFiles(db, repoId);
    const needsSymbolBackfill = hasSymbolEligibleFiles && !hasSymbols;
    if (!force && repo.last_indexed_commit === headCommit && !needsSymbolBackfill) {
      return { files_scanned: 0, duration_ms: Date.now() - start, skipped: true };
    }

    repoQueries.setIndexing(db, repoId);

    const isFullScan = force || !repo.last_indexed_commit || needsSymbolBackfill;
    const files = isFullScan
      ? await fullScan(repo.root_path)
      : await diffScan(repo.root_path, repo.last_indexed_commit!, headCommit);

    const fileContents = new Map<string, { content: string; language: string | null }>();
    for (const file of files) {
      if (file.status === "deleted") continue;
      try {
        const content = await readFile(join(repo.root_path, file.path), "utf-8");
        fileContents.set(file.path, { content, language: file.language });
      } catch {
        // File removed between discovery and read — skip
      }
    }

    extractAndPersistMetadata(db, repoId, fileContents);
    buildAndPersistImportGraph(db, repoId);
    await analyzeGitHistory(db, repoId, repo.root_path, repo.last_git_analysis_commit);

    repoQueries.updateIndexState(db, repoId, headCommit, "ready");

    return {
      files_scanned: files.length,
      duration_ms: Date.now() - start,
      skipped: false,
    };
  });
}

// ── ensureIndex — check HEAD, diff-reindex if stale ───────────────────────────

export const ensureIndex = lensFn(
  "engine.ensureIndex",
  async (db: Db, repoId: string): Promise<IndexResult> => indexImpl(db, repoId, false),
);

// ── runIndex — explicit reindex (force flag for full rescan) ──────────────────

export const runIndex = lensFn(
  "engine.runIndex",
  async (db: Db, repoId: string, force: boolean = false): Promise<IndexResult> => indexImpl(db, repoId, force),
);
