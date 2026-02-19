import { basename } from "node:path";
import { lensFn } from "@lens/core";
import type { Db } from "../db/connection.js";
import { repoQueries } from "../db/queries.js";
import { getHeadCommit } from "../index/discovery.js";
import { deriveIdentityKey } from "./identity.js";

export interface RepoRecord {
  id: string;
  identity_key: string;
  name: string;
  root_path: string;
  remote_url: string | null;
  last_indexed_commit: string | null;
  index_status: string;
  last_indexed_at: string | null;
  last_git_analysis_commit: string | null;
  max_import_depth: number | null;
  created_at: string;
}

// Validates path is a git repo, derives identity key, idempotent if already registered
export const registerRepo = lensFn(
  "engine.registerRepo",
  async (db: Db, rootPath: string, name?: string, remoteUrl?: string | null): Promise<RepoRecord> => {
    // Validate it's a git repo (throws if not)
    await getHeadCommit(rootPath);

    const identityKey = deriveIdentityKey(rootPath, remoteUrl);
    const existing = repoQueries.getByIdentityKey(db, identityKey);
    if (existing) return existing as RepoRecord;

    const repoName = name ?? (basename(rootPath) || "unknown");
    return repoQueries.insert(db, {
      identity_key: identityKey,
      name: repoName,
      root_path: rootPath,
      remote_url: remoteUrl ?? null,
    }) as RepoRecord;
  },
);

export function removeRepo(db: Db, repoId: string): { removed: boolean } {
  const existing = repoQueries.getById(db, repoId);
  if (!existing) return { removed: false };
  repoQueries.remove(db, repoId);
  return { removed: true };
}

export function listRepos(db: Db): RepoRecord[] {
  return repoQueries.getAll(db) as RepoRecord[];
}

export function getRepoStatus(db: Db, repoId: string): RepoRecord | null {
  return repoQueries.getById(db, repoId) as RepoRecord | null;
}
