import { get } from "./client.js";

interface StatusResponse {
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

// ANSI colors
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

const MAX_CONN_FAILURES = 5;

export async function showProgress(
  repoId: string,
  name: string,
  timeoutMs = 1800000,
): Promise<void> {
  const start = Date.now();
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  let lastState = "";
  let readyShown = false;
  let connFailures = 0;

  while (Date.now() - start < timeoutMs) {
    try {
      const s = await get<StatusResponse>(`/repo/${repoId}/status`);
      const f = frames[i % frames.length];
      const lines: string[] = [];

      // Header
      if (!readyShown) {
        lines.push(``);
        lines.push(`  ${bold("⚡ Indexing")} ${dim(name)}`);
        lines.push(dim(`  ${"─".repeat(40)}`));
      }

      // Chunks
      if (s.chunk_count > 0) {
        lines.push(`  ${green("✓")} Chunks          ${dim(s.chunk_count.toLocaleString())}`);
      } else {
        lines.push(`  ${cyan(f)} Chunks          ${dim("scanning...")}`);
      }

      // Metadata
      if (s.metadata_count > 0) {
        lines.push(`  ${green("✓")} Metadata        ${dim(`${s.metadata_count.toLocaleString()} files`)}`);
      } else if (s.chunk_count > 0) {
        lines.push(`  ${cyan(f)} Metadata        ${dim("extracting...")}`);
      }

      // Git
      if (s.git_commits_analyzed > 0) {
        lines.push(`  ${green("✓")} Git history     ${dim(`${s.git_commits_analyzed.toLocaleString()} files`)}`);
      } else if (s.metadata_count > 0) {
        lines.push(`  ${cyan(f)} Git history     ${dim("analyzing...")}`);
      }

      // Import graph
      if (s.import_edge_count > 0) {
        lines.push(`  ${green("✓")} Import graph    ${dim(`${s.import_edge_count.toLocaleString()} edges`)}`);
      } else if (s.metadata_count > 0) {
        lines.push(`  ${cyan(f)} Import graph    ${dim("building...")}`);
      }

      // Co-changes
      if (s.cochange_pairs > 0) {
        lines.push(`  ${green("✓")} Co-changes      ${dim(`${s.cochange_pairs.toLocaleString()} pairs`)}`);
      }

      // Embeddings — show actual numbers
      if (s.chunk_count > 0) {
        const done = s.embedded_count >= s.embeddable_count && s.embeddable_count > 0;
        const bar = createBar(s.embedded_pct, 20);

        if (done) {
          lines.push(`  ${green("✓")} Embeddings      ${dim(`${s.embedded_count}/${s.embeddable_count} code chunks`)}`);
        } else if (s.embeddable_count === 0) {
          lines.push(`  ${dim("○")} Embeddings      ${dim("no code chunks to embed")}`);
        } else {
          lines.push(`  ${cyan(f)} Embeddings      ${bar} ${dim(`${s.embedded_count}/${s.embeddable_count}`)}`);
        }
      }

      // Summaries (purpose enrichment)
      if (s.purpose_model_status === "downloading") {
        lines.push(`  ${cyan(f)} Summaries       ${dim(`Downloading model (${s.purpose_model_progress}%)...`)}`);
      } else if (s.purpose_total > 0) {
        const purposeDone = s.purpose_count >= s.purpose_total;
        if (purposeDone) {
          lines.push(`  ${green("✓")} Summaries       ${dim(`${s.purpose_count}/${s.purpose_total} files`)}`);
        } else {
          const pBar = createBar(Math.round((s.purpose_count / s.purpose_total) * 100), 20);
          lines.push(`  ${cyan(f)} Summaries       ${pBar} ${dim(`${s.purpose_count}/${s.purpose_total}`)}`);
        }
      }

      // Completion checks
      const structuralDone = s.metadata_count > 0 && s.chunk_count > 0
        && s.git_commits_analyzed > 0 && s.import_edge_count > 0;
      const embeddingsDone = (s.embedded_count >= s.embeddable_count && s.embeddable_count > 0)
        || s.embeddable_count === 0;
      const summariesDone = s.purpose_count >= s.purpose_total && s.purpose_total > 0;
      const allDone = structuralDone && embeddingsDone && summariesDone;

      // Ready message — show once structural is done (context usable)
      if (structuralDone) {
        readyShown = true;
        lines.push(``);
        if (allDone) {
          lines.push(`  ${green("✓")} ${bold("Ready")} — run ${cyan('rlm context "<goal>"')}`);
        } else {
          lines.push(`  ${green("✓")} ${bold("Ready")} — run ${cyan('rlm context "<goal>"')}`);
          lines.push(`  ${dim("Ctrl+C to exit — background tasks continue")}`);
        }
      }

      const state = lines.join("\n");
      if (state !== lastState) {
        if (lastState) {
          const prevLines = lastState.split("\n").length;
          process.stdout.write(`\x1b[${prevLines}A\x1b[J`);
        }
        process.stdout.write(state + "\n");
        lastState = state;
      }

      if (allDone) return;

      connFailures = 0;
      i++;
      await sleep(2000);
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
