import { ensureRepo } from "../util/ensure-repo.js";
import { post } from "../util/client.js";
import { output } from "../util/format.js";

interface ContextResponse {
  context_pack: string;
  stats: {
    files_in_context: number;
    index_fresh: boolean;
    duration_ms: number;
  };
}

export async function contextCommand(
  goal: string,
  opts: { json: boolean },
): Promise<void> {
  const { repo_id } = await ensureRepo();
  const res = await post<ContextResponse>("/context", { repo_id, goal });

  if (opts.json) {
    output(res, true);
  } else {
    output(res.context_pack, false);
  }
}
