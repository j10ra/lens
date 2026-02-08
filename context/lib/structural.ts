import { db } from "../../repo/db";

export interface FileStatRow {
  path: string;
  commit_count: number;
  recent_count: number;
  last_modified: Date | null;
}

export interface CochangeRow {
  path: string;
  partner: string;
  count: number;
}

/** Reverse imports: "who imports these files?" */
export async function getReverseImports(
  repoId: string,
  paths: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (paths.length === 0) return result;

  const rows = db.query<{ target_path: string; source_path: string }>`
    SELECT target_path, source_path FROM file_imports
    WHERE repo_id = ${repoId} AND target_path = ANY(${paths})
  `;
  for await (const row of rows) {
    const existing = result.get(row.target_path) ?? [];
    existing.push(row.source_path);
    result.set(row.target_path, existing);
  }
  return result;
}

/** Co-change partners for given paths */
export async function getCochanges(
  repoId: string,
  paths: string[],
  limit = 5,
): Promise<CochangeRow[]> {
  if (paths.length === 0) return [];

  const rows: CochangeRow[] = [];
  const cursor = db.query<{ path_a: string; path_b: string; cochange_count: number }>`
    SELECT path_a, path_b, cochange_count FROM file_cochanges
    WHERE repo_id = ${repoId}
      AND (path_a = ANY(${paths}) OR path_b = ANY(${paths}))
    ORDER BY cochange_count DESC
    LIMIT ${limit}
  `;
  const pathSet = new Set(paths);
  for await (const row of cursor) {
    const isA = pathSet.has(row.path_a);
    rows.push({
      path: isA ? row.path_a : row.path_b,
      partner: isA ? row.path_b : row.path_a,
      count: row.cochange_count,
    });
  }
  return rows;
}

/** File stats (commit count, recent activity) for given paths */
export async function getFileStats(
  repoId: string,
  paths: string[],
): Promise<Map<string, FileStatRow>> {
  const result = new Map<string, FileStatRow>();
  if (paths.length === 0) return result;

  const cursor = db.query<FileStatRow>`
    SELECT path, commit_count, recent_count, last_modified FROM file_stats
    WHERE repo_id = ${repoId} AND path = ANY(${paths})
  `;
  for await (const row of cursor) {
    result.set(row.path, row);
  }
  return result;
}

export interface FileMetadataRow {
  path: string;
  language: string | null;
  exports: string[];
  docstring: string;
}

/** Load file metadata index for LLM query interpretation */
export async function loadFileMetadata(repoId: string): Promise<FileMetadataRow[]> {
  const rows: FileMetadataRow[] = [];
  const cursor = db.query<{
    path: string;
    language: string | null;
    exports: string | string[];
    docstring: string;
  }>`
    SELECT fm.path, fm.language, fm.exports, fm.docstring
    FROM file_metadata fm
    WHERE fm.repo_id = ${repoId}
    ORDER BY fm.path
  `;
  for await (const row of cursor) {
    rows.push({
      path: row.path,
      language: row.language,
      exports: typeof row.exports === "string" ? JSON.parse(row.exports) : row.exports,
      docstring: row.docstring,
    });
  }
  return rows;
}
