import type { Db } from "../db/connection";
import { cochangeQueries, importQueries, jsonParse, metadataQueries, repoQueries, statsQueries } from "../db/queries";
import type { CochangeRow, FileMetadataRow, FileStatRow, VocabCluster } from "../types";

export function loadFileMetadata(db: Db, repoId: string): FileMetadataRow[] {
  return metadataQueries.getByRepo(db, repoId);
}

export function getAllFileStats(db: Db, repoId: string): Map<string, FileStatRow> {
  return statsQueries.getByRepo(db, repoId);
}

export function getReverseImports(db: Db, repoId: string, paths: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (!paths.length) return result;
  const rows = importQueries.getByTargets(db, repoId, paths);
  for (const row of rows) {
    const existing = result.get(row.target_path) ?? [];
    existing.push(row.source_path);
    result.set(row.target_path, existing);
  }
  return result;
}

export function getForwardImports(db: Db, repoId: string, paths: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (!paths.length) return result;
  const rows = importQueries.getBySources(db, repoId, paths);
  for (const row of rows) {
    const existing = result.get(row.source_path) ?? [];
    existing.push(row.target_path);
    result.set(row.source_path, existing);
  }
  return result;
}

export function get2HopReverseDeps(db: Db, repoId: string, paths: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (!paths.length) return result;

  const hop1 = getReverseImports(db, repoId, paths);
  const hop1Paths = new Set<string>();
  for (const importers of hop1.values()) {
    for (const p of importers) hop1Paths.add(p);
  }

  const hop2 = hop1Paths.size > 0 ? getReverseImports(db, repoId, [...hop1Paths]) : new Map<string, string[]>();

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

export function getCochanges(db: Db, repoId: string, paths: string[], limit = 10): CochangeRow[] {
  return cochangeQueries.getByPaths(db, repoId, paths, limit);
}

export function getIndegrees(db: Db, repoId: string): Map<string, number> {
  return importQueries.getIndegrees(db, repoId);
}

export function getCochangePartners(
  db: Db,
  repoId: string,
  paths: string[],
  minCount = 5,
  limit = 10,
): Array<{ path: string; partner: string; count: number }> {
  return cochangeQueries.getPartners(db, repoId, paths, minCount, limit);
}

const TEST_PATTERN = /\.(?:test|spec)\.|__tests__\/|_test\./;

export function discoverTestFiles(
  reverseImports: Map<string, string[]>,
  cochanges: CochangeRow[],
  metadataPaths: Set<string>,
  sourcePaths: string[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (const src of sourcePaths) {
    const tests = new Set<string>();

    // 1. Reverse importers matching test pattern
    const importers = reverseImports.get(src) ?? [];
    for (const imp of importers) {
      if (TEST_PATTERN.test(imp)) tests.add(imp);
    }

    // 2. Co-change partners matching test pattern
    for (const cc of cochanges) {
      const partner = cc.path === src ? cc.partner : cc.partner === src ? cc.path : null;
      if (partner && TEST_PATTERN.test(partner)) tests.add(partner);
    }

    // 3. Path sibling heuristic
    const ext = src.slice(src.lastIndexOf("."));
    const base = src.slice(0, src.lastIndexOf("."));
    const dir = src.slice(0, src.lastIndexOf("/"));
    const name = src.slice(src.lastIndexOf("/") + 1, src.lastIndexOf("."));
    const candidates = [
      `${base}.test${ext}`,
      `${base}.spec${ext}`,
      `${dir}/__tests__/${name}${ext}`,
      `${dir}/__tests__/${name}.test${ext}`,
    ];
    for (const c of candidates) {
      if (metadataPaths.has(c)) tests.add(c);
    }

    if (tests.size > 0) {
      result.set(src, [...tests].slice(0, 3));
    }
  }

  return result;
}

export function loadVocabClusters(db: Db, repoId: string): VocabCluster[] | null {
  const repo = repoQueries.getById(db, repoId);
  if (!repo?.vocab_clusters) return null;
  return jsonParse(repo.vocab_clusters, null as VocabCluster[] | null);
}
