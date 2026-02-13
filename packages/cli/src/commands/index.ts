import { get, post } from "../util/client.js";
import { ensureRepo } from "../util/ensure-repo.js";
import { output } from "../util/format.js";
import { showProgress } from "../util/progress.js";

interface IndexResult {
  files_scanned: number;
  chunks_created: number;
  chunks_unchanged: number;
  chunks_deleted: number;
  duration_ms: number;
}

interface IndexStatus {
  index_status: string;
  last_indexed_commit: string | null;
  last_indexed_at: string | null;
  current_head: string | null;
  is_stale: boolean;
  chunk_count: number;
  files_indexed: number;
  chunks_with_embeddings: number;
}

export async function indexCommand(opts: { json: boolean; force: boolean; status: boolean }): Promise<void> {
  const { repo_id, name } = await ensureRepo();

  if (opts.status) {
    const s = await get<IndexStatus>(`/index/status/${repo_id}`);
    if (opts.json) {
      output(s, true);
    } else {
      const lines = [
        `## Index Status: ${name}`,
        `- **Status:** ${s.index_status}`,
        `- **Last commit:** ${s.last_indexed_commit ?? "never"}`,
        `- **Last indexed:** ${s.last_indexed_at ?? "never"}`,
        `- **Current HEAD:** ${s.current_head ?? "unknown"}`,
        `- **Stale:** ${s.is_stale}`,
        `- **Files:** ${s.files_indexed}`,
        `- **Chunks:** ${s.chunk_count}`,
        `- **Embeddings:** ${s.chunks_with_embeddings}`,
      ];
      output(lines.join("\n"), false);
    }
    return;
  }

  if (opts.json) {
    const res = await post<IndexResult>("/index/run", { repo_id, force: opts.force });
    output(res, true);
    return;
  }

  // Fire index request non-blocking, poll progress immediately
  post("/index/run", { repo_id, force: opts.force }).catch(() => {});
  await showProgress(repo_id, name);
}
