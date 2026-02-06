import { ensureRepo } from "../util/ensure-repo.js";
import { post } from "../util/client.js";
import { output } from "../util/format.js";

interface RunResponse {
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  trace_id: string;
}

export async function runCommand(
  command: string,
  opts: { json: boolean; timeout?: string },
): Promise<void> {
  const { repo_id } = await ensureRepo();
  const timeout_ms = opts.timeout ? parseInt(opts.timeout, 10) : undefined;

  const res = await post<RunResponse>("/runner/run", {
    repo_id,
    command,
    timeout_ms,
  });

  if (opts.json) {
    output(res, true);
  } else {
    if (res.stdout) output(res.stdout, false);
    if (res.stderr) {
      process.stderr.write(res.stderr + "\n");
    }
    output(`\nExit: ${res.exit_code} (${res.duration_ms}ms)`, false);
  }
}
