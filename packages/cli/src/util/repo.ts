import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export interface RepoInfo {
  root_path: string;
  name: string;
  remote_url?: string;
}

/** Walk up from cwd to find .git directory */
function findGitRoot(from: string): string | null {
  let dir = resolve(from);
  while (true) {
    if (existsSync(resolve(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Parse origin URL from .git/config */
async function parseRemoteUrl(gitRoot: string): Promise<string | undefined> {
  try {
    const config = await readFile(resolve(gitRoot, ".git/config"), "utf-8");
    const match = config.match(/\[remote "origin"\][^[]*url\s*=\s*(.+)/m);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

/** Detect git repo from current working directory */
export async function detectRepo(cwd = process.cwd()): Promise<RepoInfo> {
  const root = findGitRoot(cwd);
  if (!root) {
    throw new Error("Not inside a git repository. Run from a git repo or use `git init`.");
  }

  const remote_url = await parseRemoteUrl(root);
  const name = basename(root);

  return { root_path: root, name, remote_url };
}
