import { ensureRepo } from "../util/ensure-repo.js";
import { post } from "../util/client.js";
import { output } from "../util/format.js";

interface TaskResponse {
  context_pack: string;
  analysis: {
    keywords: string[];
    scope: string;
    task_type: string;
  };
  stats: {
    files_in_context: number;
    index_fresh: boolean;
    duration_ms: number;
  };
}

export async function taskCommand(
  goal: string,
  opts: { json: boolean },
): Promise<void> {
  const { repo_id } = await ensureRepo();
  const res = await post<TaskResponse>("/task", { repo_id, goal });

  if (opts.json) {
    output(res, true);
  } else {
    output(res.context_pack, false);
  }
}
