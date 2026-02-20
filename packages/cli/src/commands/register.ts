import { resolve } from "node:path";
import { defineCommand } from "citty";
import { daemonFetch } from "../lib/daemon.js";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface Repo {
  id: string;
  name: string;
  root_path: string;
  index_status: string;
}

interface IndexResult {
  files_scanned: number;
  duration_ms: number;
  skipped: boolean;
}

export const register = defineCommand({
  meta: {
    description: "Register a repo with the daemon for indexing.",
  },
  args: {
    path: {
      type: "positional",
      required: true,
      description: "Path to repo root (absolute or relative)",
    },
    name: {
      type: "string",
      alias: "n",
      description: "Human-readable name (defaults to directory name)",
    },
  },
  async run({ args }) {
    const absPath = resolve(args.path);

    // 1. Register
    const res = await daemonFetch("/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: absPath, name: args.name }),
    });
    const repo = (await res.json()) as Repo;

    console.log();
    console.log(`  ${bold("⚡ LENS")} ${dim(repo.name)}`);
    console.log(dim(`  ${"─".repeat(40)}`));
    console.log(`  ${green("✓")} Registered       ${dim(repo.root_path)}`);

    // 2. Index with spinner
    let frame = 0;
    const spinner = setInterval(() => {
      const f = frames[frame++ % frames.length];
      process.stdout.write(`\r  ${cyan(f)} Indexing...`);
    }, 80);

    const idxRes = await daemonFetch(`/repos/${repo.id}/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    const idx = (await idxRes.json()) as IndexResult;

    clearInterval(spinner);
    process.stdout.write(`\r  ${green("✓")} Files scanned    ${dim(`${idx.files_scanned} files`)}\n`);

    // 3. Fetch stats for summary
    try {
      const statsRes = await daemonFetch(`/repos/${repo.id}/files?limit=0`);
      const statsData = (await statsRes.json()) as { total: number };

      console.log(`  ${green("✓")} Metadata         ${dim(`${statsData.total} files`)}`);
    } catch {
      // stats not critical
    }

    console.log(`  ${green("✓")} Duration         ${dim(`${idx.duration_ms}ms`)}`);
    console.log();
    console.log(`  ${green("✓")} ${bold("Ready")} — ${cyan(`lens grep "<query>"`)} ${dim(`--repo ${absPath}`)}`);
    console.log();
  },
});
