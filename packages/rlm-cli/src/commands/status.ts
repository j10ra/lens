import { get } from "../util/client.js";
import { ensureRepo } from "../util/ensure-repo.js";
import { output } from "../util/format.js";

interface StatusResponse {
  indexed_commit: string | null;
  current_head: string | null;
  is_stale: boolean;
  chunk_count: number;
  files_indexed: number;
  embedded_count: number;
  embedded_pct: number;
  summary_count: number;
  embedder: string;
  embedding_dim: number;
  last_activity: string | null;
  trace_count: number;
}

export async function statusCommand(opts: { json: boolean }): Promise<void> {
  const { repo_id, name } = await ensureRepo();
  const s = await get<StatusResponse>(`/repo/${repo_id}/status`);

  if (opts.json) {
    output(s, true);
    return;
  }

  const staleTag = s.is_stale ? " (STALE)" : "";
  const lines = [
    `## ${name}${staleTag}`,
    "",
    "Index:",
    `  Commit:     ${s.indexed_commit ? s.indexed_commit.slice(0, 8) : "(none)"}`,
    `  HEAD:       ${s.current_head ? s.current_head.slice(0, 8) : "(unknown)"}`,
    `  Files:      ${s.files_indexed.toLocaleString()}`,
    `  Chunks:     ${s.chunk_count.toLocaleString()}`,
    `  Embeddings: ${s.embedded_count.toLocaleString()} (${s.embedded_pct}%) [${s.embedder.replace("Xenova/", "")}, dim:${s.embedding_dim}]`,
    `  Summaries:  ${s.summary_count.toLocaleString()}`,
    "",
    "Activity (30m):",
    `  Traces:     ${s.trace_count}`,
    `  Last:       ${s.last_activity ?? "(none)"}`,
  ];

  output(lines.join("\n"), false);
}
