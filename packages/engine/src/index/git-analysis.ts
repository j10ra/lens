import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Db } from "../db/connection.js";
import { cochangeQueries, repoQueries, statsQueries } from "../db/queries.js";

const execFileAsync = promisify(execFile);

const MAX_FILES_PER_COMMIT = 20;
const MIN_COCHANGE_THRESHOLD = 2;
const RECENT_DAYS = 90;

interface CommitEntry {
  hash: string;
  date: Date;
  files: string[];
}

/**
 * Parses git log --name-only --format=%H%x00%aI output into commit entries.
 * Each block: `hash\0isoDate\n\nfile1\nfile2\n\n`
 */
export function parseGitLog(stdout: string): CommitEntry[] {
  const commits: CommitEntry[] = [];
  // Split on double newline — separates commit blocks
  const blocks = stdout.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split("\n").filter(Boolean);
    if (lines.length === 0) continue;

    // First line: hash\0isoDate
    const header = lines[0];
    const nullIdx = header.indexOf("\0");
    if (nullIdx === -1) continue;

    const hash = header.slice(0, nullIdx).trim();
    const isoDate = header.slice(nullIdx + 1).trim();
    if (!hash || !isoDate) continue;

    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) continue;

    const files = lines
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean);

    commits.push({ hash, date, files });
  }

  return commits;
}

/**
 * Analyzes git history to compute per-file commit counts and pairwise co-change frequencies.
 * Skips merge commits (--no-merges) and commits touching >20 files.
 * Persists results to fileStats and fileCochanges tables.
 * Supports incremental analysis from sinceCommit.
 */
export async function analyzeGitHistory(
  db: Db,
  repoId: string,
  repoRoot: string,
  sinceCommit?: string | null,
): Promise<void> {
  const args = ["log", "--name-only", "--format=%H%x00%aI", "--no-merges"];
  if (sinceCommit) args.push(`${sinceCommit}..HEAD`);

  let stdout: string;
  try {
    const result = await execFileAsync("git", args, {
      cwd: repoRoot,
      maxBuffer: 100 * 1024 * 1024,
    });
    stdout = result.stdout;
  } catch {
    // Git not available or repo has no commits — silently return
    return;
  }

  if (!stdout.trim()) return;

  const commits = parseGitLog(stdout);
  if (commits.length === 0) return;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_DAYS);

  // Per-file stats accumulator
  const stats = new Map<string, { commitCount: number; recentCount: number; lastModified: Date }>();

  // Pairwise co-change accumulator — key: `${pathA}\0${pathB}` (pathA < pathB for consistent dedup)
  const cochanges = new Map<string, number>();

  for (const commit of commits) {
    // Skip large commits — monorepo root commits pollute signal
    if (commit.files.length > MAX_FILES_PER_COMMIT) continue;

    const isRecent = commit.date >= cutoff;

    for (const f of commit.files) {
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

    // Generate all unique pairs — O(n^2) but bounded by MAX_FILES_PER_COMMIT
    const files = commit.files;
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        // Lexicographic order ensures consistent key regardless of commit file order
        const [a, b] = files[i] < files[j] ? [files[i], files[j]] : [files[j], files[i]];
        const key = `${a}\0${b}`;
        cochanges.set(key, (cochanges.get(key) ?? 0) + 1);
      }
    }
  }

  // Persist per-file stats
  const statsArray = Array.from(stats.entries()).map(([p, s]) => ({
    path: p,
    commitCount: s.commitCount,
    recentCount: s.recentCount,
    lastModified: s.lastModified.toISOString(),
  }));
  if (statsArray.length > 0) {
    statsQueries.upsertStats(db, repoId, statsArray);
  }

  // Persist co-change pairs with count >= MIN_COCHANGE_THRESHOLD (filter noise)
  const pairsArray: Array<{ pathA: string; pathB: string; count: number }> = [];
  for (const [key, count] of cochanges) {
    if (count < MIN_COCHANGE_THRESHOLD) continue;
    const nullIdx = key.indexOf("\0");
    pairsArray.push({ pathA: key.slice(0, nullIdx), pathB: key.slice(nullIdx + 1), count });
  }
  if (pairsArray.length > 0) {
    cochangeQueries.upsertPairs(db, repoId, pairsArray);
  }

  // Store HEAD commit for incremental analysis
  const headCommit = commits[0]?.hash;
  if (headCommit) {
    repoQueries.updateGitAnalysisCommit(db, repoId, headCommit);
  }
}
