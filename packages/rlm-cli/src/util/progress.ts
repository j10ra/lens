import { get } from "./client.js";

interface StatusResponse {
  index_status: string;
  chunk_count: number;
  files_indexed: number;
  embedded_count: number;
  embeddable_count: number;
  embedded_pct: number;
  metadata_count: number;
  import_edge_count: number;
  git_commits_analyzed: number;
  cochange_pairs: number;
  purpose_count: number;
  purpose_total: number;
  purpose_model_status: string;
  purpose_model_progress: number;
}

// ANSI
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

const MAX_CONN_FAILURES = 5;
const TOTAL_LINES = 16; // fixed line count to prevent layout shift

export async function showProgress(
  repoId: string,
  name: string,
  timeoutMs = 1800000,
): Promise<void> {
  const start = Date.now();
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  let lastState = "";
  let connFailures = 0;

  while (Date.now() - start < timeoutMs) {
    try {
      const s = await get<StatusResponse>(`/repo/${repoId}/status`);
      const f = frames[i % frames.length];
      const indexing = s.index_status === "indexing";
      const lines: string[] = [];

      // Header (3 lines)
      lines.push(``);
      if (indexing) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        lines.push(`  ${bold("⚡ Indexing")} ${dim(name)} ${dim(`${elapsed}s`)}`);
      } else {
        lines.push(`  ${bold("⚡ Indexing")} ${dim(name)}`);
      }
      lines.push(dim(`  ${"─".repeat(40)}`));

      // Items (7 lines — always present)
      if (indexing) {
        lines.push(`  ${cyan(f)} Chunks          ${dim(s.chunk_count > 0 ? s.chunk_count.toLocaleString() : "...")}`);
        lines.push(`  ${dim("○")} Metadata        ${dim("...")}`);
        lines.push(`  ${dim("○")} Git history     ${dim("...")}`);
        lines.push(`  ${dim("○")} Import graph    ${dim("...")}`);
        lines.push(`  ${dim("○")} Co-changes      ${dim("...")}`);
        lines.push(`  ${dim("○")} Embeddings      ${dim("...")}`);
        lines.push(`  ${dim("○")} Summaries       ${dim("...")}`);
      } else {
        // Chunks
        lines.push(`  ${s.chunk_count > 0 ? green("✓") : cyan(f)} Chunks          ${dim(s.chunk_count > 0 ? s.chunk_count.toLocaleString() : "scanning...")}`);
        // Metadata
        lines.push(`  ${s.metadata_count > 0 ? green("✓") : cyan(f)} Metadata        ${dim(s.metadata_count > 0 ? `${s.metadata_count.toLocaleString()} files` : "extracting...")}`);
        // Git
        lines.push(`  ${s.git_commits_analyzed > 0 ? green("✓") : cyan(f)} Git history     ${dim(s.git_commits_analyzed > 0 ? `${s.git_commits_analyzed.toLocaleString()} files` : "analyzing...")}`);
        // Import graph
        lines.push(`  ${s.import_edge_count > 0 ? green("✓") : cyan(f)} Import graph    ${dim(s.import_edge_count > 0 ? `${s.import_edge_count.toLocaleString()} edges` : "building...")}`);
        // Co-changes
        lines.push(`  ${s.cochange_pairs > 0 ? green("✓") : dim("○")} Co-changes      ${dim(s.cochange_pairs > 0 ? `${s.cochange_pairs.toLocaleString()} pairs` : "...")}`);
        // Embeddings
        const embDone = s.embedded_count >= s.embeddable_count && s.embeddable_count > 0;
        if (embDone) {
          lines.push(`  ${green("✓")} Embeddings      ${dim(`${s.embedded_count}/${s.embeddable_count} code chunks`)}`);
        } else if (s.embeddable_count === 0) {
          lines.push(`  ${dim("○")} Embeddings      ${dim("no code chunks")}`);
        } else {
          lines.push(`  ${cyan(f)} Embeddings      ${createBar(s.embedded_pct, 20)} ${dim(`${s.embedded_count}/${s.embeddable_count}`)}`);
        }
        // Summaries
        const sumDone = s.purpose_count >= s.purpose_total && s.purpose_total > 0;
        if (s.purpose_model_status === "downloading") {
          lines.push(`  ${cyan(f)} Summaries       ${dim(`Downloading model (${s.purpose_model_progress}%)...`)}`);
        } else if (sumDone) {
          lines.push(`  ${green("✓")} Summaries       ${dim(`${s.purpose_count}/${s.purpose_total} files`)}`);
        } else if (s.purpose_total > 0) {
          lines.push(`  ${cyan(f)} Summaries       ${createBar(Math.round((s.purpose_count / s.purpose_total) * 100), 20)} ${dim(`${s.purpose_count}/${s.purpose_total}`)}`);
        } else {
          lines.push(`  ${dim("○")} Summaries       ${dim("...")}`);
        }
      }

      // Completion checks
      const structuralDone = !indexing && s.metadata_count > 0 && s.chunk_count > 0
        && s.git_commits_analyzed > 0 && s.import_edge_count > 0;
      const embDone = (s.embedded_count >= s.embeddable_count && s.embeddable_count > 0) || s.embeddable_count === 0;
      const sumDone = s.purpose_count >= s.purpose_total && s.purpose_total > 0;
      const allDone = structuralDone && embDone && sumDone;

      // Footer (always 6 lines — pad to fixed total)
      lines.push(``);
      if (indexing) {
        lines.push(`  ${dim("Runs in background — Ctrl+C to exit")}`);
        lines.push(`  ${dim("Check progress:")} ${cyan("rlm status")}`);
      } else if (allDone) {
        lines.push(`  ${green("✓")} ${bold("Ready")} — ${cyan('rlm context "<goal>"')}`);
        lines.push(``);
      } else if (structuralDone) {
        lines.push(`  ${green("✓")} ${bold("Ready")} — ${cyan('rlm context "<goal>"')}`);
        lines.push(`  ${dim("Background tasks continue — Ctrl+C to exit, check:")} ${cyan("rlm status")}`);
      } else {
        lines.push(`  ${dim("Runs in background — Ctrl+C to exit")}`);
        lines.push(`  ${dim("Check progress:")} ${cyan("rlm status")}`);
      }

      // Pad to fixed line count
      while (lines.length < TOTAL_LINES) lines.push(``);

      const state = lines.join("\n");
      if (state !== lastState) {
        if (lastState) {
          process.stdout.write(`\x1b[${TOTAL_LINES}A\x1b[J`);
        }
        process.stdout.write(state + "\n");
        lastState = state;
      }

      if (allDone) return;

      connFailures = 0;
      i++;
      await sleep(1000);
    } catch (err) {
      connFailures++;
      if (connFailures >= MAX_CONN_FAILURES) {
        process.stdout.write(`\n  ${red("✗")} ${bold("Daemon unavailable")} — ${dim("connection lost after " + connFailures + " retries")}\n`);
        process.stdout.write(`  ${dim("Restart with: encore run")}\n\n`);
        process.exit(1);
      }
      await sleep(1000);
    }
  }
}

function createBar(pct: number, width: number): string {
  const clamped = Math.min(pct, 100);
  const filled = Math.round((clamped / 100) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `\x1b[32m${bar}\x1b[0m`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
