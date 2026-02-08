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

/** All file stats for a repo — single query, no path filter */
export async function getAllFileStats(
  repoId: string,
): Promise<Map<string, FileStatRow>> {
  const result = new Map<string, FileStatRow>();
  const cursor = db.query<FileStatRow>`
    SELECT path, commit_count, recent_count, last_modified FROM file_stats
    WHERE repo_id = ${repoId}
  `;
  for await (const row of cursor) {
    result.set(row.path, row);
  }
  return result;
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

/** Forward imports: "what does each file import?" */
export async function getForwardImports(
  repoId: string,
  paths: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (paths.length === 0) return result;

  const rows = db.query<{ source_path: string; target_path: string }>`
    SELECT source_path, target_path FROM file_imports
    WHERE repo_id = ${repoId} AND source_path = ANY(${paths})
  `;
  for await (const row of rows) {
    const existing = result.get(row.source_path) ?? [];
    existing.push(row.target_path);
    result.set(row.source_path, existing);
  }
  return result;
}

/** 2-hop reverse deps: for each path, get importers-of-importers */
export async function get2HopReverseDeps(
  repoId: string,
  paths: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (paths.length === 0) return result;

  // Hop 1: direct importers
  const hop1 = await getReverseImports(repoId, paths);
  const hop1Paths = new Set<string>();
  for (const importers of hop1.values()) {
    for (const p of importers) hop1Paths.add(p);
  }

  // Hop 2: importers of importers
  const hop2 = hop1Paths.size > 0
    ? await getReverseImports(repoId, [...hop1Paths])
    : new Map<string, string[]>();

  // Merge: for each original path, chain hop1 → hop2
  const pathSet = new Set(paths);
  for (const p of paths) {
    const direct = hop1.get(p) ?? [];
    const chains: string[] = [];
    for (const importer of direct) {
      const hop2Importers = hop2.get(importer) ?? [];
      for (const h2 of hop2Importers) {
        if (!pathSet.has(h2) && h2 !== importer && !chains.includes(h2)) {
          chains.push(h2);
        }
      }
    }
    if (chains.length > 0) result.set(p, chains.slice(0, 5));
  }
  return result;
}

/** Co-change partners for given paths */
export async function getCochanges(
  repoId: string,
  paths: string[],
  limit = 10,
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

export interface FileMetadataRow {
  path: string;
  language: string | null;
  exports: string[];
  docstring: string;
}

/** Load file metadata index for query interpretation */
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
