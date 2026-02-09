import { ensureRepo } from "../util/ensure-repo.js";
import { post, get } from "../util/client.js";
import { output } from "../util/format.js";

interface WatchResponse {
  started: boolean;
  already_watching: boolean;
}

interface WatchStatusResponse {
  watching: boolean;
  repo_root: string | null;
  changed_files: number;
  deleted_files: number;
  started_at: string | null;
}

export async function watchCommand(opts: { json: boolean }): Promise<void> {
  const { repo_id, name } = await ensureRepo();
  const res = await post<WatchResponse>("/index/watch", { repo_id });

  if (opts.json) {
    output(res, true);
  } else if (res.already_watching) {
    output(`${name} is already being watched`, false);
  } else {
    output(`File watcher started for ${name}`, false);
  }
}

export async function unwatchCommand(opts: { json: boolean }): Promise<void> {
  const { repo_id, name } = await ensureRepo();
  const res = await post<{ stopped: boolean }>("/index/unwatch", { repo_id });

  if (opts.json) {
    output(res, true);
  } else if (res.stopped) {
    output(`File watcher stopped for ${name}`, false);
  } else {
    output(`${name} was not being watched`, false);
  }
}

export async function watchStatusCommand(opts: { json: boolean }): Promise<void> {
  const { repo_id, name } = await ensureRepo();
  const res = await get<WatchStatusResponse>(`/index/watch-status/${repo_id}`);

  if (opts.json) {
    output(res, true);
  } else if (res.watching) {
    output(
      `${name}: watching since ${res.started_at}\n` +
      `  Changed: ${res.changed_files} files | Deleted: ${res.deleted_files} files`,
      false,
    );
  } else {
    output(`${name}: not watching. Run \`rlm repo watch\` to start.`, false);
  }
}
