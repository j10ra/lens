import { get } from "../util/client.js";
import { output } from "../util/format.js";

interface DaemonStats {
  repos_count: number;
  total_chunks: number;
  total_embeddings: number;
  total_summaries: number;
  total_traces: number;
  db_size_mb: number;
}

export async function daemonStatsCommand(opts: { json: boolean }): Promise<void> {
  const s = await get<DaemonStats>("/daemon/stats");

  if (opts.json) {
    output(s, true);
    return;
  }

  const embedPct = s.total_chunks > 0
    ? Math.round((s.total_embeddings / s.total_chunks) * 100)
    : 0;

  const lines = [
    "## RLM Daemon",
    "",
    `  Repos:      ${s.repos_count}`,
    `  Chunks:     ${s.total_chunks.toLocaleString()}`,
    `  Embeddings: ${s.total_embeddings.toLocaleString()} (${embedPct}%)`,
    `  Summaries:  ${s.total_summaries.toLocaleString()}`,
    `  Traces:     ${s.total_traces.toLocaleString()}`,
    `  DB Size:    ${s.db_size_mb} MB`,
  ];

  output(lines.join("\n"), false);
}
