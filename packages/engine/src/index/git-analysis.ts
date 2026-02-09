import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Db } from "../db/connection";
import { statsQueries, cochangeQueries, repoQueries } from "../db/queries";
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

export async function analyzeGitHistory(
  db: Db,
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

  if (!stdout.trim() && lastAnalyzedCommit) {
    try {
      const full = await execFileAsync(
        "git",
        ["log", "--name-only", "--format=%H %aI", "--no-merges", `-n`, `${MAX_COMMITS}`],
        { cwd: rootPath, maxBuffer: 50 * 1024 * 1024 },
      );
      stdout = full.stdout;
    } catch {
      return { commits: 0, cochangePairs: 0 };
    }
  }

  if (!stdout.trim()) return { commits: 0, cochangePairs: 0 };

  const commits = parseGitLog(stdout);
  if (commits.length === 0) return { commits: 0, cochangePairs: 0 };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_DAYS);

  const stats = new Map<string, { commitCount: number; recentCount: number; lastModified: Date }>();
  const cochanges = new Map<string, number>();

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

    for (let i = 0; i < codeFiles.length; i++) {
      for (let j = i + 1; j < codeFiles.length; j++) {
        const [a, b] = codeFiles[i] < codeFiles[j] ? [codeFiles[i], codeFiles[j]] : [codeFiles[j], codeFiles[i]];
        const key = `${a}\0${b}`;
        cochanges.set(key, (cochanges.get(key) ?? 0) + 1);
      }
    }
  }

  for (const [path, s] of stats) {
    statsQueries.upsert(db, repoId, path, s.commitCount, s.recentCount, s.lastModified.toISOString());
  }

  let pairCount = 0;
  for (const [key, count] of cochanges) {
    if (count < 2) continue;
    const [pathA, pathB] = key.split("\0");
    cochangeQueries.upsert(db, repoId, pathA, pathB, count);
    pairCount++;
  }

  const headHash = commits[0]?.hash;
  if (headHash) {
    repoQueries.updateGitAnalysisCommit(db, repoId, headHash);
  }

  return { commits: commits.length, cochangePairs: pairCount };
}

export function parseGitLog(stdout: string): CommitEntry[] {
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
