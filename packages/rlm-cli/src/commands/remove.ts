import { request } from "../util/client.js";
import { ensureRepo } from "../util/ensure-repo.js";
import { output } from "../util/format.js";

interface DeleteResponse {
  deleted: boolean;
  chunks_removed: number;
  summaries_removed: number;
  traces_removed: number;
}

export async function removeCommand(opts: { json: boolean; yes: boolean }): Promise<void> {
  const { repo_id, name } = await ensureRepo();

  if (!opts.yes) {
    process.stderr.write(`Remove "${name}" (${repo_id})? All index data will be deleted.\n`);
    process.stderr.write(`Re-run with --yes to confirm.\n`);
    process.exit(1);
  }

  const res = await request<DeleteResponse>("DELETE", `/repo/${repo_id}`);

  if (opts.json) {
    output(res, true);
  } else {
    output(
      `Removed ${name}: ${res.chunks_removed} chunks, ${res.summaries_removed} summaries, ${res.traces_removed} traces deleted`,
      false,
    );
  }
}
