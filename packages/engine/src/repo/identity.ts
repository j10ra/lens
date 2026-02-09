import { createHash } from "node:crypto";

function normalizeRemoteUrl(url: string): string {
  let normalized = url.trim();

  const sshMatch = normalized.match(/^[\w-]+@([\w.-]+):(.+)$/);
  if (sshMatch) {
    normalized = `${sshMatch[1]}/${sshMatch[2]}`;
  } else {
    normalized = normalized.replace(/^https?:\/\//, "");
  }

  normalized = normalized.replace(/\.git$/, "");
  normalized = normalized.replace(/\/$/, "");
  return normalized.toLowerCase();
}

export function deriveIdentityKey(rootPath: string, remoteUrl?: string | null): string {
  const source = remoteUrl ? normalizeRemoteUrl(remoteUrl) : rootPath;
  return createHash("sha256").update(source).digest("hex");
}
