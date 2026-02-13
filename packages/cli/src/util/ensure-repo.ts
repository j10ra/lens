import { post } from "./client.js";
import { detectRepo } from "./repo.js";

interface RegisterResponse {
  repo_id: string;
  identity_key: string;
  name: string;
  created: boolean;
}

/** Detect repo from cwd, auto-register with daemon, return repo_id */
export async function ensureRepo(): Promise<{ repo_id: string; name: string; root_path: string }> {
  const info = await detectRepo();
  const res = await post<RegisterResponse>("/repo/register", {
    root_path: info.root_path,
    name: info.name,
    remote_url: info.remote_url,
  });
  return { repo_id: res.repo_id, name: res.name, root_path: info.root_path };
}
