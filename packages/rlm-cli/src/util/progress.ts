import { get } from "./client.js";

interface StatusResponse {
  embedded_pct: number;
  chunk_count: number;
  embedded_count: number;
}

export async function showProgress(
  repoId: string,
  name: string,
  timeoutMs = 1800000, // 30 minutes - enough for any repo
): Promise<void> {
  const start = Date.now();
  const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;

  while (Date.now() - start < timeoutMs) {
    try {
      const s = await get<StatusResponse>(`/repo/${repoId}/status`);

      // Clear line and show progress
      const frame = spinner[i % spinner.length];
      const bar = createBar(s.embedded_pct, 20);
      process.stdout.write(
        `\r${frame} Indexing ${name}: ${bar} ${s.embedded_pct}% (${s.embedded_count}/${s.chunk_count} chunks)`,
      );

      if (s.embedded_pct >= 95) {
        process.stdout.write(
          `\r✓ Indexing complete: ${s.chunk_count} chunks, ${s.embedded_count} embedded (${s.embedded_pct}%)\n`,
        );
        return;
      }

      i++;
      await sleep(2000);
    } catch {
      // Status fetch failed — might still be starting, retry quickly
      await sleep(100);
    }
  }

  // Timeout - should rarely happen with 30min timeout and sync indexing
  process.stdout.write(
    `\r⏳ Indexing timed out. Run \`rlm status\` to check progress.\n`,
  );
}

function createBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
