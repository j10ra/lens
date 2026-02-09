import { get } from "../util/client.js";
import { output } from "../util/format.js";

interface DaemonStats {
  repos_count: number;
  total_chunks: number;
  total_embeddings: number;
  db_size_mb: number;
  last_maintenance_at: string | null;
  next_maintenance_at: string | null;
  last_maintenance_result: { processed: number; errors: number } | null;
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

  const maintResult = s.last_maintenance_result
    ? `${s.last_maintenance_result.processed} processed, ${s.last_maintenance_result.errors} errors`
    : "—";

  const lines = [
    "## RLM Daemon",
    "",
    `  Repos:      ${s.repos_count}`,
    `  Chunks:     ${s.total_chunks.toLocaleString()}`,
    `  Embeddings: ${s.total_embeddings.toLocaleString()} (${embedPct}%)`,
    `  DB Size:    ${s.db_size_mb} MB`,
    "",
    "  ## Maintenance Cron",
    `  Last maintenance: ${s.last_maintenance_at ?? "never"}`,
    `  Next maintenance: ${s.next_maintenance_at ?? "—"}`,
    `  Last result:      ${maintResult}`,
  ];

  output(lines.join("\n"), false);
}
