import { ensureRepo } from "../util/ensure-repo.js";
import { get, post } from "../util/client.js";
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

  const res = await post<IndexResult>("/index/run", { repo_id, force: opts.force });

  if (opts.json) {
    output(res, true);
  } else {
    output(
      [
        `Indexed **${name}** in ${res.duration_ms}ms`,
        `- Files scanned: ${res.files_scanned}`,
        `- Chunks created: ${res.chunks_created}`,
        `- Chunks unchanged: ${res.chunks_unchanged}`,
        `- Chunks deleted: ${res.chunks_deleted}`,
      ].join("\n"),
      false,
    );
  }

  if (!opts.json) {
    await showProgress(repo_id, name);
  }
}
