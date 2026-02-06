import { db } from "../repo/db";
import { summarizeFile } from "./summarizer";
import { summarizeDirectory } from "./directory";
import { dirname } from "node:path";

export interface SummaryResult {
  files_summarized: number;
  files_cached: number;
  dirs_summarized: number;
  dirs_cached: number;
  duration_ms: number;
}

/** Lazy trigger: summarize indexed files that lack current summaries.
 *  Builds directory summaries bottom-up after file summaries. */
export async function ensureSummarized(
  repoId: string,
  paths?: string[],
): Promise<SummaryResult> {
  const start = Date.now();

  const repo = await db.queryRow<{ root_path: string }>`
    SELECT root_path FROM repos WHERE id = ${repoId}
  `;
  if (!repo) throw new Error("repo not found");

  // Get distinct file paths from indexed chunks
  let filePaths: string[];
  if (paths && paths.length > 0) {
    filePaths = paths;
  } else {
    const rows: string[] = [];
    const cursor = db.query<{ path: string }>`
      SELECT DISTINCT path FROM chunks WHERE repo_id = ${repoId} ORDER BY path
    `;
    for await (const row of cursor) {
      rows.push(row.path);
    }
    filePaths = rows;
  }

  let filesSummarized = 0;
  let filesCached = 0;

  // Summarize files
  for (const fp of filePaths) {
    try {
      const result = await summarizeFile(repoId, repo.root_path, fp);
      if (result.cached) filesCached++;
      else filesSummarized++;
    } catch (err) {
      console.error(`Summary failed for ${fp}:`, err);
    }
  }

  // Build directory summaries bottom-up
  const dirs = collectDirs(filePaths);
  let dirsSummarized = 0;
  let dirsCached = 0;

  // Sort deepest first for bottom-up
  const sortedDirs = [...dirs].sort((a, b) => b.split("/").length - a.split("/").length);

  for (const dir of sortedDirs) {
    try {
      // Get child summaries (files + subdirs in this dir)
      const children: Array<{ path: string; summary: string }> = [];
      const cursor = db.query<{ path: string; summary: string }>`
        SELECT DISTINCT ON (path) path, summary FROM summaries
        WHERE repo_id = ${repoId}
          AND (
            (level = 'file' AND path LIKE ${dir + "/%"} AND path NOT LIKE ${dir + "/%/%"})
            OR
            (level = 'directory' AND path LIKE ${dir + "/%"} AND path NOT LIKE ${dir + "/%/%"})
          )
        ORDER BY path, updated_at DESC
      `;
      for await (const row of cursor) {
        children.push(row);
      }

      if (children.length === 0) continue;

      const result = await summarizeDirectory(repoId, dir, children);
      if (result.cached) dirsCached++;
      else dirsSummarized++;
    } catch (err) {
      console.error(`Dir summary failed for ${dir}:`, err);
    }
  }

  return {
    files_summarized: filesSummarized,
    files_cached: filesCached,
    dirs_summarized: dirsSummarized,
    dirs_cached: dirsCached,
    duration_ms: Date.now() - start,
  };
}

/** Extract unique directory paths from file paths */
function collectDirs(filePaths: string[]): Set<string> {
  const dirs = new Set<string>();
  for (const fp of filePaths) {
    let dir = dirname(fp);
    while (dir && dir !== ".") {
      dirs.add(dir);
      dir = dirname(dir);
    }
  }
  return dirs;
}
