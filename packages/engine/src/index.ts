import { lensFn } from "@lens/core";
import type { Db } from "./db/connection.js";
import { buildGraphDetail as _buildGraphDetail, buildGraphSummary as _buildGraphSummary } from "./graph/graph.js";
import { grepRepoImpl } from "./grep/grep.js";
import { getRepoStatus as _getRepoStatus, listRepos as _listRepos, removeRepo as _removeRepo } from "./repo/repo.js";

// ── DB infrastructure (not lensFn-wrapped — configure/get are infra, not engine operations) ──

export type { Db } from "./db/connection.js";
export { configureEngineDb, getEngineDb, getRawDb } from "./db/connection.js";

// ── Already lensFn-wrapped exports (re-export as-is) ──────────────────────────

// runIndex + ensureIndex are lensFn-wrapped in engine.ts
export { ensureIndex, runIndex } from "./index/engine.js";

// registerRepo is lensFn("engine.registerRepo", ...) in repo.ts
export { registerRepo } from "./repo/repo.js";

// ── Sync repo operations — wrapped in lensFn here (sync body, async signature) ──

export const removeRepo = lensFn(
  "engine.removeRepo",
  async (db: Db, repoId: string): Promise<{ removed: boolean }> => _removeRepo(db, repoId),
);

export const listRepos = lensFn("engine.listRepos", async (db: Db) => _listRepos(db));

export const getRepoStatus = lensFn("engine.getRepoStatus", async (db: Db, repoId: string) =>
  _getRepoStatus(db, repoId),
);

// ── Grep engine — wrapped in lensFn ───────────────────────────────────────────

export const grepRepo = lensFn("engine.grepRepo", grepRepoImpl);

// ── Graph engine — wrapped in lensFn ──────────────────────────────────────────

export const buildGraphSummary = lensFn("engine.buildGraphSummary", async (db: Db, repoId: string) =>
  _buildGraphSummary(db, repoId),
);

export const buildGraphDetail = lensFn("engine.buildGraphDetail", async (db: Db, repoId: string, dir: string) =>
  _buildGraphDetail(db, repoId, dir),
);

// ── Query modules — typed drizzle access for daemon routes ───────────────────

export {
  aggregateQueries,
  cochangeQueries,
  graphQueries,
  importQueries,
  metadataQueries,
  statsQueries,
} from "./db/queries.js";

// ── Type exports ──────────────────────────────────────────────────────────────

export type {
  GraphCluster,
  GraphClusterEdge,
  GraphCochange,
  GraphDetail,
  GraphFileEdge,
  GraphFileNode,
  GraphSummary,
} from "./graph/graph.js";
export type { EnrichedMatch, GrepResult } from "./grep/grep.js";
export type { IndexResult } from "./index/engine.js";
export type { RepoRecord } from "./repo/repo.js";
