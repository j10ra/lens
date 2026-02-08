import { request } from "../util/client.js";
import { ensureRepo } from "../util/ensure-repo.js";
import { output } from "../util/format.js";

interface DeleteResponse {
  deleted: boolean;
  chunks_removed: number;
  traces_removed: number;
}

export async function removeCommand(opts: { json: boolean; yes: boolean }): Promise<void> {
  const { repo_id, name } = await ensureRepo();

  if (!opts.yes) {
    process.stderr.write(`Remove "${name}" (${repo_id})? All index data will be deleted.\n`);
    process.stderr.write(`Re-run with --yes to confirm.\n`);
    process.exit(1);
  }

  const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  let phase = "Stopping watcher";

  const interval = setInterval(() => {
    const frame = spinner[i % spinner.length];
    process.stdout.write(`\r${frame} ${phase}...`);
    i++;
  }, 80);

  // Brief pause so "Stopping watcher" is visible before the delete call
  await new Promise((r) => setTimeout(r, 200));
  phase = `Removing ${name}`;

  const res = await request<DeleteResponse>("DELETE", `/repo/${repo_id}`);

  clearInterval(interval);

  if (opts.json) {
    output(res, true);
  } else {
    process.stdout.write(`\r✓ Removed ${name}: ${res.chunks_removed} chunks, ${res.traces_removed} traces deleted\n`);
  }
}
