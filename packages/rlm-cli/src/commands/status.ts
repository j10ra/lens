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
  embeddable_count: number;
  embedded_pct: number;
  embedder: string;
  embedding_dim: number;
  metadata_count: number;
  import_edge_count: number;
  git_commits_analyzed: number;
  cochange_pairs: number;
  purpose_count: number;
  purpose_total: number;
  purpose_model_status: string;
  purpose_model_progress: number;
}

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

export async function statusCommand(opts: { json: boolean }): Promise<void> {
  const { repo_id, name } = await ensureRepo();
  const s = await get<StatusResponse>(`/repo/${repo_id}/status`);

  if (opts.json) {
    output(s, true);
    return;
  }

  const staleTag = s.is_stale ? yellow(" STALE") : "";
  const check = green("✓");
  const pending = dim("○");

  const embLabel = s.embeddable_count > 0
    ? `${s.embedded_count}/${s.embeddable_count} code chunks (${s.embedded_pct}%)`
    : "no code chunks";
  const embIcon = s.embedded_count >= s.embeddable_count && s.embeddable_count > 0 ? check : pending;

  const purposeLabel = s.purpose_total > 0
    ? `${s.purpose_count}/${s.purpose_total} files`
    : "no files";
  const purposeIcon = s.purpose_count > 0 && s.purpose_count >= s.purpose_total ? check : pending;

  const lines = [
    ``,
    `  ${bold(name)}${staleTag}`,
    dim(`  ${"─".repeat(40)}`),
    `  ${s.chunk_count > 0 ? check : pending} Chunks        ${dim(s.chunk_count.toLocaleString())}`,
    `  ${s.metadata_count > 0 ? check : pending} Metadata      ${dim(`${s.metadata_count.toLocaleString()} files`)}`,
    `  ${s.git_commits_analyzed > 0 ? check : pending} Git history   ${dim(`${s.git_commits_analyzed.toLocaleString()} files`)}`,
    `  ${s.import_edge_count > 0 ? check : pending} Import graph  ${dim(`${s.import_edge_count.toLocaleString()} edges`)}`,
    `  ${s.cochange_pairs > 0 ? check : pending} Co-changes    ${dim(`${s.cochange_pairs.toLocaleString()} pairs`)}`,
    `  ${embIcon} Embeddings    ${dim(embLabel)}`,
    `  ${purposeIcon} Summaries     ${dim(purposeLabel)}`,
  ];

  output(lines.join("\n"), false);
}
