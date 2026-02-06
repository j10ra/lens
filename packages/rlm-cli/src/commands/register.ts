import { detectRepo } from "../util/repo.js";
import { post } from "../util/client.js";
import { output } from "../util/format.js";

interface RegisterResponse {
  repo_id: string;
  identity_key: string;
  name: string;
  created: boolean;
}

export async function registerCommand(opts: { json: boolean }): Promise<void> {
  const info = await detectRepo();
  const res = await post<RegisterResponse>("/repo/register", {
    root_path: info.root_path,
    name: info.name,
    remote_url: info.remote_url,
  });

  if (opts.json) {
    output(res, true);
  } else {
    if (res.created) {
      output(`Registered ${res.name} (repo_id: ${res.repo_id})\nIndexing + file watcher started. Run \`rlm status\` to check progress.`, false);
    } else {
      output(`Already registered ${res.name} (repo_id: ${res.repo_id})`, false);
    }
  }
}
