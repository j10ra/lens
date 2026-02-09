import { db } from "../../repo/db";
import { getHeadCommit } from "./discovery";
import { runIndex, type IndexResult } from "./engine";

/** Lazy trigger: index only if HEAD has advanced since last index.
 *  Called automatically by search/task endpoints. */
export async function ensureIndexed(repoId: string): Promise<IndexResult | null> {
  const repo = await db.queryRow<{
    root_path: string;
    last_indexed_commit: string | null;
  }>`SELECT root_path, last_indexed_commit FROM repos WHERE id = ${repoId}`;

  if (!repo) throw new Error("repo not found");

  const head = await getHeadCommit(repo.root_path);

  if (repo.last_indexed_commit === head) {
    return null; // up to date
  }

  return runIndex(repoId);
}
