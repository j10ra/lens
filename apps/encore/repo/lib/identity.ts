import { createHash } from "node:crypto";

/** Normalize git remote URL to a canonical form for identity comparison.
 *  git@github.com:user/repo.git → github.com/user/repo
 *  https://github.com/user/repo.git → github.com/user/repo */
function normalizeRemoteUrl(url: string): string {
  let normalized = url.trim();

  // SSH → path form: git@host:user/repo → host/user/repo
  const sshMatch = normalized.match(/^[\w-]+@([\w.-]+):(.+)$/);
  if (sshMatch) {
    normalized = `${sshMatch[1]}/${sshMatch[2]}`;
  } else {
    // Strip protocol
    normalized = normalized.replace(/^https?:\/\//, "");
  }

  // Strip trailing .git
  normalized = normalized.replace(/\.git$/, "");
  // Strip trailing slash
  normalized = normalized.replace(/\/$/, "");
  // Lowercase host portion
  return normalized.toLowerCase();
}

/** Derive a deterministic identity key for a repo.
 *  If remote_url exists → SHA-256 of normalized remote.
 *  Otherwise → SHA-256 of absolute root_path. */
export function deriveIdentityKey(
  rootPath: string,
  remoteUrl?: string | null,
): string {
  const source = remoteUrl
    ? normalizeRemoteUrl(remoteUrl)
    : rootPath;
  return createHash("sha256").update(source).digest("hex");
}
