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
  vocab_cluster_count: number;
  has_capabilities?: boolean;
  embedding_quota_exceeded?: boolean;
  purpose_quota_exceeded?: boolean;
}

// ANSI
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

const MAX_CONN_FAILURES = 5;
const TOTAL_LINES = 18;
const POLL_INTERVAL = 5000;
const RENDER_INTERVAL = 33; // ~30fps

export async function showProgress(repoId: string, name: string, timeoutMs = 1800000): Promise<void> {
  const start = Date.now();
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frame = 0;
  let connFailures = 0;
  let lastRendered = "";
  let data: StatusResponse | null = null;
  let done = false;

  // Data fetcher — runs every POLL_INTERVAL
  const poll = async () => {
    while (!done && Date.now() - start < timeoutMs) {
      try {
        data = await get<StatusResponse>(`/repo/${repoId}/status`);
        connFailures = 0;
      } catch {
        connFailures++;
        if (connFailures >= MAX_CONN_FAILURES) {
          process.stdout.write(
            `\n  ${red("✗")} ${bold("Daemon unavailable")} — ${dim(`connection lost after ${connFailures} retries`)}\n`,
          );
          process.stdout.write(`  ${dim("Restart with: lens start")}\n\n`);
          process.exit(1);
        }
      }
      await sleep(POLL_INTERVAL);
    }
  };

  // Start polling in background
  poll();

  // Wait for first data
  while (!data && Date.now() - start < timeoutMs) {
    await sleep(100);
  }
  if (!data) return;

  // Render loop — 30fps
  while (Date.now() - start < timeoutMs) {
    const s = data!;
    const f = frames[frame % frames.length];
    const indexing = s.index_status === "indexing";
    const hasCaps = s.has_capabilities !== false;
    const lines: string[] = [];

    // Header
    lines.push(``);
    if (indexing) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      lines.push(`  ${bold("⚡ Indexing")} ${dim(name)} ${dim(`${elapsed}s`)}`);
    } else {
      lines.push(`  ${bold("⚡ Indexing")} ${dim(name)}`);
    }
    lines.push(dim(`  ${"─".repeat(40)}`));

    // Items
    if (indexing) {
      lines.push(`  ${cyan(f)} Chunks          ${dim(s.chunk_count > 0 ? s.chunk_count.toLocaleString() : "...")}`);
      lines.push(`  ${dim("○")} Metadata        ${dim("...")}`);
      lines.push(`  ${dim("○")} Git history     ${dim("...")}`);
      lines.push(`  ${dim("○")} Import graph    ${dim("...")}`);
      lines.push(`  ${dim("○")} Co-changes      ${dim("...")}`);
      if (hasCaps) {
        lines.push(`  ${dim("○")} Vocab clusters  ${dim("...")}`);
        lines.push(`  ${dim("○")} Embeddings      ${dim("...")}`);
        lines.push(`  ${dim("○")} Summaries       ${dim("...")}`);
      } else {
        lines.push(``);
        lines.push(`  ${yellow("⚡")} ${bold("Pro")}`);
        lines.push(`    ${dim("· Vocab clusters")}`);
        lines.push(`    ${dim("· Embeddings")}`);
        lines.push(`    ${dim("· Summaries")}`);
        lines.push(`    ${dim("lens login → upgrade to enable")}`);
      }
    } else {
      lines.push(
        `  ${s.chunk_count > 0 ? green("✓") : cyan(f)} Chunks          ${dim(s.chunk_count > 0 ? s.chunk_count.toLocaleString() : "scanning...")}`,
      );
      lines.push(
        `  ${s.metadata_count > 0 ? green("✓") : cyan(f)} Metadata        ${dim(s.metadata_count > 0 ? `${s.metadata_count.toLocaleString()} files` : "extracting...")}`,
      );
      lines.push(
        `  ${s.git_commits_analyzed > 0 ? green("✓") : cyan(f)} Git history     ${dim(s.git_commits_analyzed > 0 ? `${s.git_commits_analyzed.toLocaleString()} files` : "analyzing...")}`,
      );
      lines.push(
        `  ${s.import_edge_count > 0 ? green("✓") : cyan(f)} Import graph    ${dim(s.import_edge_count > 0 ? `${s.import_edge_count.toLocaleString()} edges` : "building...")}`,
      );
      lines.push(
        `  ${s.cochange_pairs > 0 ? green("✓") : dim("○")} Co-changes      ${dim(s.cochange_pairs > 0 ? `${s.cochange_pairs.toLocaleString()} pairs` : "...")}`,
      );

      if (hasCaps) {
        // Vocab clusters
        if (s.vocab_cluster_count > 0) {
          lines.push(`  ${green("✓")} Vocab clusters  ${dim(`${s.vocab_cluster_count} clusters`)}`);
        } else {
          lines.push(`  ${cyan(f)} Vocab clusters  ${dim("building...")}`);
        }
        // Embeddings
        const embDone = s.embedded_count >= s.embeddable_count && s.embeddable_count > 0;
        if (embDone) {
          lines.push(`  ${green("✓")} Embeddings      ${dim(`${s.embedded_count}/${s.embeddable_count} code chunks`)}`);
        } else if (s.embedding_quota_exceeded) {
          lines.push(
            `  ${yellow("⚠")} Embeddings      ${dim(`quota exceeded — ${s.embedded_count}/${s.embeddable_count}`)}`,
          );
        } else if (s.embeddable_count === 0) {
          lines.push(`  ${dim("○")} Embeddings      ${dim("no code chunks")}`);
        } else {
          lines.push(
            `  ${cyan(f)} Embeddings      ${createBar(s.embedded_pct, 20)} ${dim(`${s.embedded_count}/${s.embeddable_count}`)}`,
          );
        }
        // Summaries
        const sumDone = s.purpose_count >= s.purpose_total && s.purpose_total > 0;
        if (sumDone) {
          lines.push(`  ${green("✓")} Summaries       ${dim(`${s.purpose_count}/${s.purpose_total} files`)}`);
        } else if (s.purpose_quota_exceeded) {
          lines.push(
            `  ${yellow("⚠")} Summaries       ${dim(`quota exceeded — ${s.purpose_count}/${s.purpose_total}`)}`,
          );
        } else if (s.purpose_total > 0) {
          lines.push(
            `  ${cyan(f)} Summaries       ${createBar(Math.round((s.purpose_count / s.purpose_total) * 100), 20)} ${dim(`${s.purpose_count}/${s.purpose_total}`)}`,
          );
        } else {
          lines.push(`  ${dim("○")} Summaries       ${dim("...")}`);
        }
      } else {
        // Pro upsell — no capabilities
        lines.push(``);
        lines.push(`  ${yellow("⚡")} ${bold("Pro")}`);
        lines.push(`    ${dim("· Vocab clusters")}`);
        lines.push(`    ${dim("· Embeddings")}`);
        lines.push(`    ${dim("· Summaries")}`);
        lines.push(`    ${dim("lens login → upgrade to enable")}`);
      }
    }

    // Completion checks
    const structuralDone =
      !indexing && s.metadata_count > 0 && s.chunk_count > 0 && s.git_commits_analyzed > 0 && s.import_edge_count > 0;

    let allDone: boolean;
    if (hasCaps) {
      const embDone =
        (s.embedded_count >= s.embeddable_count && s.embeddable_count > 0) ||
        s.embeddable_count === 0 ||
        !!s.embedding_quota_exceeded;
      const sumDone = (s.purpose_count >= s.purpose_total && s.purpose_total > 0) || !!s.purpose_quota_exceeded;
      allDone = structuralDone && embDone && sumDone;
    } else {
      // Without caps, structural completion = done
      allDone = structuralDone;
    }

    // Footer
    lines.push(``);
    if (indexing) {
      lines.push(`  ${dim("Runs in background — Ctrl+C to exit")}`);
      lines.push(`  ${dim("Check progress:")} ${cyan("lens status")}`);
    } else if (allDone) {
      lines.push(`  ${green("✓")} ${bold("Ready")} — ${cyan('lens context "<goal>"')}`);
      lines.push(``);
    } else if (structuralDone) {
      lines.push(`  ${green("✓")} ${bold("Ready")} — ${cyan('lens context "<goal>"')}`);
      if (hasCaps) {
        lines.push(`  ${dim("Background tasks continue — Ctrl+C to exit, check:")} ${cyan("lens status")}`);
      } else {
        lines.push(``);
      }
    } else {
      lines.push(`  ${dim("Runs in background — Ctrl+C to exit")}`);
      lines.push(`  ${dim("Check progress:")} ${cyan("lens status")}`);
    }

    while (lines.length < TOTAL_LINES) lines.push(``);

    const output = lines.join("\n");
    if (lastRendered) {
      process.stdout.write(`\x1b[${TOTAL_LINES}A\x1b[J`);
    }
    process.stdout.write(`${output}\n`);
    lastRendered = output;

    if (allDone) {
      done = true;
      return;
    }

    frame++;
    await sleep(RENDER_INTERVAL);
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
