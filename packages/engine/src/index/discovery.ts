import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const MAX_FILE_SIZE = 2 * 1024 * 1024;

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".svg",
  ".webp",
  ".mp3",
  ".mp4",
  ".wav",
  ".avi",
  ".mov",
  ".mkv",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".7z",
  ".rar",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".o",
  ".a",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".lock",
  ".bin",
  ".dat",
  ".db",
  ".sqlite",
]);

const DOCS_EXTENSIONS = new Set([".md", ".json", ".yaml", ".yml", ".toml", ".txt", ".rst", ".adoc", ".sql"]);

export function isDocFile(filePath: string): boolean {
  return DOCS_EXTENSIONS.has(extname(filePath).toLowerCase());
}

export const LANG_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".rb": "ruby",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".c": "c",
  ".h": "c",
  ".hpp": "cpp",
  ".swift": "swift",
  ".php": "php",
  ".sql": "sql",
  ".sh": "shell",
  ".bash": "shell",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".json": "json",
  ".toml": "toml",
  ".md": "markdown",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
};

export interface DiscoveredFile {
  path: string;
  absolute_path: string;
  language: string | null;
  status: "added" | "modified" | "deleted";
}

export function detectLanguage(filePath: string): string | null {
  return LANG_MAP[extname(filePath).toLowerCase()] ?? null;
}

export function isBinaryExt(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(extname(filePath).toLowerCase());
}

export async function fullScan(repoRoot: string): Promise<DiscoveredFile[]> {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], { cwd: repoRoot, maxBuffer: 50 * 1024 * 1024 });
  const paths = stdout.split("\0").filter(Boolean);

  const results: DiscoveredFile[] = [];
  for (const p of paths) {
    if (isBinaryExt(p)) continue;
    const abs = resolve(repoRoot, p);
    try {
      const s = await stat(abs);
      if (s.size > MAX_FILE_SIZE) continue;
    } catch {
      continue;
    }
    results.push({ path: p, absolute_path: abs, language: detectLanguage(p), status: "added" });
  }
  return results;
}

export async function diffScan(repoRoot: string, fromCommit: string, toCommit: string): Promise<DiscoveredFile[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-status", "--diff-filter=ACMRD", "-z", `${fromCommit}..${toCommit}`],
    { cwd: repoRoot, maxBuffer: 50 * 1024 * 1024 },
  );

  const parts = stdout.split("\0").filter(Boolean);
  const results: DiscoveredFile[] = [];

  for (let i = 0; i < parts.length; i += 2) {
    const statusChar = parts[i];
    const p = parts[i + 1];
    if (!p) continue;
    if (isBinaryExt(p)) continue;

    const abs = resolve(repoRoot, p);
    let status: DiscoveredFile["status"];
    if (statusChar === "D") {
      status = "deleted";
    } else if (statusChar === "A") {
      status = "added";
    } else {
      status = "modified";
    }

    if (status !== "deleted") {
      try {
        const s = await stat(abs);
        if (s.size > MAX_FILE_SIZE) continue;
      } catch {
        continue;
      }
    }

    results.push({ path: p, absolute_path: abs, language: detectLanguage(p), status });
  }

  return results;
}

export async function getHeadCommit(repoRoot: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
  return stdout.trim();
}
