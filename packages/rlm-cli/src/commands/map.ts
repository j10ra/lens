import { ensureRepo } from "../util/ensure-repo.js";
import { get } from "../util/client.js";
import { output } from "../util/format.js";

interface MapResponse {
  map: string;
}

export async function mapCommand(opts: { json: boolean; depth: string }): Promise<void> {
  const { repo_id } = await ensureRepo();
  const depth = opts.depth ? `&max_depth=${opts.depth}` : "";
  const res = await get<MapResponse>(`/summary/${repo_id}/map?${depth}`);

  if (opts.json) {
    output(res, true);
  } else {
    output(res.map, false);
  }
}
