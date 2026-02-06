import { ensureRepo } from "../util/ensure-repo.js";
import { post } from "../util/client.js";
import { output } from "../util/format.js";

interface TaskResponse {
  context_pack: string;
  plan?: unknown;
}

export async function taskCommand(goal: string, opts: { json: boolean }): Promise<void> {
  const { repo_id } = await ensureRepo();
  const res = await post<TaskResponse>("/task", { repo_id, goal });

  if (opts.json) {
    output(res, true);
  } else {
    output(res.context_pack, false);
  }
}
