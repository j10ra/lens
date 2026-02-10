import type { Db } from "../db/connection";
import type { RegisterResponse, StatusResponse } from "../types";
import { repoQueries, chunkQueries, metadataQueries } from "../db/queries";
import type { VocabCluster } from "../types";
import { deriveIdentityKey } from "./identity";
import { getHeadCommit } from "../index/discovery";

export function registerRepo(
  db: Db,
  rootPath: string,
  name?: string,
  remoteUrl?: string,
): RegisterResponse {
  const identityKey = deriveIdentityKey(rootPath, remoteUrl);
  const repoName = name ?? rootPath.split("/").pop() ?? "unknown";
  const { id, created } = repoQueries.upsert(db, identityKey, repoName, rootPath, remoteUrl ?? null);
  return { repo_id: id, identity_key: identityKey, name: repoName, created };
}

export function getRepo(db: Db, id: string) {
  const repo = repoQueries.getById(db, id);
  if (!repo) throw new Error("repo not found");
  return repo;
}

export function listRepos(db: Db) {
  return repoQueries.list(db);
}

export function removeRepo(db: Db, id: string): { deleted: boolean; chunks_removed: number } {
  const chunkCount = chunkQueries.countByRepo(db, id);
  const deleted = repoQueries.remove(db, id);
  if (!deleted) throw new Error("repo not found");
  return { deleted: true, chunks_removed: chunkCount };
}

export async function getRepoStatus(db: Db, id: string): Promise<StatusResponse> {
  const repo = repoQueries.getById(db, id);
  if (!repo) throw new Error("repo not found");

  let currentHead: string | null = null;
  try {
    currentHead = await getHeadCommit(repo.root_path);
  } catch {}

  const isStale = !!(currentHead && repo.last_indexed_commit !== currentHead);
  const stats = chunkQueries.getStats(db, id);
  const structural = metadataQueries.getStructuralStats(db, id);
  const vocabRaw = repo.vocab_clusters;
  const vocabClusters: VocabCluster[] = vocabRaw ? JSON.parse(vocabRaw) : [];

  return {
    index_status: repo.index_status,
    indexed_commit: repo.last_indexed_commit,
    current_head: currentHead,
    is_stale: isStale,
    chunk_count: stats.chunk_count,
    files_indexed: stats.files_indexed,
    embedded_count: stats.embedded_count,
    embeddable_count: stats.embeddable_count,
    embedded_pct: stats.embeddable_count > 0 ? Math.round((stats.embedded_count / stats.embeddable_count) * 100) : 0,
    metadata_count: structural.metadata_count,
    import_edge_count: structural.import_edge_count,
    git_commits_analyzed: structural.git_file_count,
    cochange_pairs: structural.cochange_pairs,
    purpose_count: structural.purpose_count,
    purpose_total: structural.purpose_total,
    vocab_cluster_count: Array.isArray(vocabClusters) ? vocabClusters.length : 0,
  };
}
