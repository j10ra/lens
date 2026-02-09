import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "../../repo/db";
import { isDocFile } from "./discovery";

const execFileAsync = promisify(execFile);

const MAX_COMMITS = 2000;
const MAX_FILES_PER_COMMIT = 20;
const RECENT_DAYS = 90;

interface CommitEntry {
  hash: string;
  date: Date;
  files: string[];
}

/** Parse git log, compute file stats + co-changes, persist to DB */
export async function analyzeGitHistory(
  repoId: string,
  rootPath: string,
  lastAnalyzedCommit: string | null,
): Promise<{ commits: number; cochangePairs: number }> {
  const args = ["log", "--name-only", "--format=%H %aI", "--no-merges", `-n`, `${MAX_COMMITS}`];
  if (lastAnalyzedCommit) args.push(`${lastAnalyzedCommit}..HEAD`);

  let stdout: string;
  try {
    const result = await execFileAsync("git", args, {
      cwd: rootPath,
      maxBuffer: 50 * 1024 * 1024,
    });
    stdout = result.stdout;
  } catch {
    return { commits: 0, cochangePairs: 0 };
  }

  // If incremental range was empty but we have a stale marker, retry full
  if (!stdout.trim() && lastAnalyzedCommit) {
    try {
      const full = await execFileAsync("git", [
        "log", "--name-only", "--format=%H %aI", "--no-merges", `-n`, `${MAX_COMMITS}`,
      ], { cwd: rootPath, maxBuffer: 50 * 1024 * 1024 });
      stdout = full.stdout;
    } catch {
      return { commits: 0, cochangePairs: 0 };
    }
  }

  if (!stdout.trim()) return { commits: 0, cochangePairs: 0 };

  // Parse commits
  const commits = parseGitLog(stdout);
  if (commits.length === 0) return { commits: 0, cochangePairs: 0 };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_DAYS);

  // Aggregate file stats
  const stats = new Map<string, { commitCount: number; recentCount: number; lastModified: Date }>();
  const cochanges = new Map<string, number>(); // "pathA\0pathB" → count

  for (const commit of commits) {
    if (commit.files.length > MAX_FILES_PER_COMMIT) continue;

    const codeFiles = commit.files.filter((f) => !isDocFile(f));
    const isRecent = commit.date >= cutoff;

    for (const f of codeFiles) {
      const existing = stats.get(f);
      if (existing) {
        existing.commitCount++;
        if (isRecent) existing.recentCount++;
        if (commit.date > existing.lastModified) existing.lastModified = commit.date;
      } else {
        stats.set(f, {
          commitCount: 1,
          recentCount: isRecent ? 1 : 0,
          lastModified: commit.date,
        });
      }
    }

    // Co-changes: pairs within same commit (canonical order)
    for (let i = 0; i < codeFiles.length; i++) {
      for (let j = i + 1; j < codeFiles.length; j++) {
        const [a, b] = codeFiles[i] < codeFiles[j]
          ? [codeFiles[i], codeFiles[j]]
          : [codeFiles[j], codeFiles[i]];
        const key = `${a}\0${b}`;
        cochanges.set(key, (cochanges.get(key) ?? 0) + 1);
      }
    }
  }

  // Persist file_stats
  for (const [path, s] of stats) {
    await db.exec`
      INSERT INTO file_stats (repo_id, path, commit_count, recent_count, last_modified)
      VALUES (${repoId}, ${path}, ${s.commitCount}, ${s.recentCount}, ${s.lastModified})
      ON CONFLICT (repo_id, path) DO UPDATE
        SET commit_count = file_stats.commit_count + EXCLUDED.commit_count,
            recent_count = EXCLUDED.recent_count,
            last_modified = GREATEST(file_stats.last_modified, EXCLUDED.last_modified)
    `;
  }

  // Persist co-changes (only pairs with count >= 2)
  let pairCount = 0;
  for (const [key, count] of cochanges) {
    if (count < 2) continue;
    const [pathA, pathB] = key.split("\0");
    await db.exec`
      INSERT INTO file_cochanges (repo_id, path_a, path_b, cochange_count)
      VALUES (${repoId}, ${pathA}, ${pathB}, ${count})
      ON CONFLICT (repo_id, path_a, path_b) DO UPDATE
        SET cochange_count = file_cochanges.cochange_count + EXCLUDED.cochange_count
    `;
    pairCount++;
  }

  // Update last analyzed commit
  const headHash = commits[0]?.hash;
  if (headHash) {
    await db.exec`UPDATE repos SET last_git_analysis_commit = ${headHash} WHERE id = ${repoId}`;
  }

  return { commits: commits.length, cochangePairs: pairCount };
}

function parseGitLog(stdout: string): CommitEntry[] {
  const commits: CommitEntry[] = [];
  const HEADER_RE = /^([a-f0-9]{7,}) (\d{4}-\d{2}-\d{2}T[\w:+.-]+)$/;

  const lines = stdout.split("\n");
  let current: CommitEntry | null = null;

  for (const line of lines) {
    const headerMatch = line.match(HEADER_RE);
    if (headerMatch) {
      if (current) commits.push(current);
      current = { hash: headerMatch[1], date: new Date(headerMatch[2]), files: [] };
      continue;
    }
    const trimmed = line.trim();
    if (trimmed && current) {
      current.files.push(trimmed);
    }
  }
  if (current) commits.push(current);

  return commits;
}
