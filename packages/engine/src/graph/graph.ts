import type { Db } from "../db/connection.js";
import { cochangeQueries, graphQueries, importQueries, metadataQueries } from "../db/queries.js";
import { getIndegrees } from "../grep/structural.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GraphCluster {
  key: string;
  fileCount: number;
}

export interface GraphClusterEdge {
  source: string;
  target: string;
  weight: number;
}

export interface GraphSummary {
  clusters: GraphCluster[];
  edges: GraphClusterEdge[];
}

export interface GraphSymbol {
  name: string;
  kind: string;
  line: number;
  exported: boolean;
}

export interface GraphFileNode {
  path: string;
  language: string | null;
  exports: string[];
  symbols: GraphSymbol[];
  hubScore: number;
  isHub: boolean;
  commits: number;
  recent90d: number;
}

export interface GraphFileEdge {
  source: string;
  target: string;
}

export interface GraphCochange {
  source: string;
  target: string;
  weight: number;
}

export interface GraphDetail {
  files: GraphFileNode[];
  edges: GraphFileEdge[];
  cochanges: GraphCochange[];
}

export interface GraphOverviewNode {
  path: string;
  language: string | null;
  hubScore: number;
  isHub: boolean;
  commits: number;
  recent90d: number;
}

export interface GraphOverview {
  files: GraphOverviewNode[];
  edges: GraphFileEdge[];
  cochanges: GraphCochange[];
  totalFiles: number;
}

export interface FileNeighborhood {
  file: GraphFileNode;
  imports: string[];
  importers: string[];
  cochanges: { path: string; weight: number }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive cluster key from file path — first 2 segments (e.g. "packages/engine") */
export function clusterKey(path: string): string {
  const parts = path.split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
}

// ── Builders ──────────────────────────────────────────────────────────────────

/** Cluster-level summary: groups files into directory clusters, counts inter-cluster edges */
export function buildGraphSummary(db: Db, repoId: string): GraphSummary {
  const allFiles = metadataQueries.getAllForRepo(db, repoId);
  const allEdges = graphQueries.allImportEdges(db, repoId);

  // Group files by cluster
  const clusterCounts = new Map<string, number>();
  for (const f of allFiles) {
    const key = clusterKey(f.path);
    clusterCounts.set(key, (clusterCounts.get(key) ?? 0) + 1);
  }

  // Count inter-cluster edges (bidirectional aggregation)
  const edgeMap = new Map<string, number>();
  for (const edge of allEdges) {
    const srcCluster = clusterKey(edge.source);
    const tgtCluster = clusterKey(edge.target);
    if (srcCluster === tgtCluster) continue;

    // Canonical key: alphabetical ordering for bidirectional merge
    const [a, b] = srcCluster < tgtCluster ? [srcCluster, tgtCluster] : [tgtCluster, srcCluster];
    const mapKey = `${a}\0${b}`;
    edgeMap.set(mapKey, (edgeMap.get(mapKey) ?? 0) + 1);
  }

  const clusters: GraphCluster[] = [...clusterCounts.entries()].map(([key, fileCount]) => ({
    key,
    fileCount,
  }));

  const edges: GraphClusterEdge[] = [...edgeMap.entries()].map(([mapKey, weight]) => {
    const [source, target] = mapKey.split("\0");
    return { source, target, weight };
  });

  return { clusters, edges };
}

/** File-level detail for a directory prefix: nodes, import edges, cochanges */
export function buildGraphDetail(db: Db, repoId: string, dir: string): GraphDetail {
  const allFiles = metadataQueries.getAllForRepo(db, repoId);
  const dirFiles = allFiles.filter((f) => f.path.startsWith(dir));
  const dirPaths = new Set(dirFiles.map((f) => f.path));

  const indegrees = getIndegrees(db, repoId);
  const maxIndegree = Math.max(1, ...indegrees.values());

  // Git activity stats
  const allStats = graphQueries.allFileStats(db, repoId);
  const statsMap = new Map(allStats.map((s) => [s.path, s]));

  const files: GraphFileNode[] = dirFiles.map((f) => {
    const indegree = indegrees.get(f.path) ?? 0;
    const stats = statsMap.get(f.path);
    let exports: string[] = [];
    let symbols: GraphSymbol[] = [];
    try {
      exports = f.exports ? JSON.parse(f.exports) : [];
    } catch {
      // malformed JSON — default to empty
    }
    try {
      const parsed = f.symbols ? JSON.parse(f.symbols) : [];
      if (Array.isArray(parsed)) {
        symbols = parsed
          .filter(
            (s): s is GraphSymbol =>
              !!s &&
              typeof s === "object" &&
              typeof s.name === "string" &&
              typeof s.kind === "string" &&
              typeof s.line === "number" &&
              typeof s.exported === "boolean",
          )
          .slice(0, 200);
      }
    } catch {
      // malformed JSON — default to empty
    }
    return {
      path: f.path,
      language: f.language,
      exports,
      symbols,
      hubScore: indegree / maxIndegree,
      isHub: indegree >= 5,
      commits: stats?.commit_count ?? 0,
      recent90d: stats?.recent_count ?? 0,
    };
  });

  // Import edges where at least one endpoint is in the directory
  const allEdges = graphQueries.allImportEdges(db, repoId);
  const edges: GraphFileEdge[] = allEdges
    .filter((e) => dirPaths.has(e.source) || dirPaths.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  // Cochanges where at least one endpoint is in the directory
  const allCochanges = graphQueries.allCochanges(db, repoId);
  const cochanges: GraphCochange[] = allCochanges
    .filter((c) => dirPaths.has(c.path_a) || dirPaths.has(c.path_b))
    .map((c) => ({ source: c.path_a, target: c.path_b, weight: c.cochange_count }));

  return { files, edges, cochanges };
}

/** Lightweight overview: top N files by hubScore, no symbols/exports, pruned cochanges */
export function buildGraphOverview(
  db: Db,
  repoId: string,
  dir: string,
  opts?: { limit?: number; minCochangeWeight?: number },
): GraphOverview {
  const limit = opts?.limit ?? 5000;
  const minWeight = opts?.minCochangeWeight ?? 2;

  const allFiles = metadataQueries.getAllForRepo(db, repoId);
  const dirFiles = allFiles.filter((f) => f.path.startsWith(dir));
  const totalFiles = dirFiles.length;

  const indegrees = getIndegrees(db, repoId);
  const maxIndegree = Math.max(1, ...indegrees.values());

  const allStats = graphQueries.allFileStats(db, repoId);
  const statsMap = new Map(allStats.map((s) => [s.path, s]));

  // Score all files, sort by hubScore desc, take top N
  const scored = dirFiles
    .map((f) => {
      const indegree = indegrees.get(f.path) ?? 0;
      const stats = statsMap.get(f.path);
      return {
        path: f.path,
        language: f.language,
        hubScore: indegree / maxIndegree,
        isHub: indegree >= 5,
        commits: stats?.commit_count ?? 0,
        recent90d: stats?.recent_count ?? 0,
      } satisfies GraphOverviewNode;
    })
    .sort((a, b) => b.hubScore - a.hubScore || a.path.localeCompare(b.path));

  const files = scored.slice(0, limit);
  const fileSet = new Set(files.map((f) => f.path));

  // Edges pruned to returned subset
  const allEdges = graphQueries.allImportEdges(db, repoId);
  const edges: GraphFileEdge[] = allEdges
    .filter((e) => fileSet.has(e.source) && fileSet.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  // Cochanges: filtered by weight, pruned to returned subset
  const rawCochanges = graphQueries.filteredCochanges(db, repoId, minWeight);
  const cochanges: GraphCochange[] = rawCochanges
    .filter((c) => fileSet.has(c.path_a) && fileSet.has(c.path_b))
    .map((c) => ({ source: c.path_a, target: c.path_b, weight: c.cochange_count }));

  return { files, edges, cochanges, totalFiles };
}

/** Full detail for a single file: symbols, exports, imports, importers, cochanges */
export function buildFileNeighbors(
  db: Db,
  repoId: string,
  filePath: string,
  opts?: { cochangeLimit?: number },
): FileNeighborhood | null {
  const meta = metadataQueries.getByRepoPath(db, repoId, filePath);
  if (!meta) return null;

  const cochangeLimit = opts?.cochangeLimit ?? 30;
  const indegrees = getIndegrees(db, repoId);
  const maxIndegree = Math.max(1, ...indegrees.values());
  const indegree = indegrees.get(filePath) ?? 0;

  const stats = graphQueries.allFileStats(db, repoId);
  const fileStats = stats.find((s) => s.path === filePath);

  let exports: string[] = [];
  let symbols: GraphSymbol[] = [];
  try {
    exports = meta.exports ? JSON.parse(meta.exports) : [];
  } catch {
    /* empty */
  }
  try {
    const parsed = meta.symbols ? JSON.parse(meta.symbols) : [];
    if (Array.isArray(parsed)) {
      symbols = parsed
        .filter(
          (s): s is GraphSymbol =>
            !!s &&
            typeof s === "object" &&
            typeof s.name === "string" &&
            typeof s.kind === "string" &&
            typeof s.line === "number" &&
            typeof s.exported === "boolean",
        )
        .slice(0, 200);
    }
  } catch {
    /* empty */
  }

  const file: GraphFileNode = {
    path: meta.path,
    language: meta.language,
    exports,
    symbols,
    hubScore: indegree / maxIndegree,
    isHub: indegree >= 5,
    commits: fileStats?.commit_count ?? 0,
    recent90d: fileStats?.recent_count ?? 0,
  };

  const imports = importQueries.getImports(db, repoId, filePath);
  const importers = importQueries.getImporters(db, repoId, filePath);

  const rawCochanges = cochangeQueries.getPartners(db, repoId, filePath);
  const cochanges = rawCochanges.slice(0, cochangeLimit).map((c) => ({
    path: c.path_a === filePath ? c.path_b : c.path_a,
    weight: c.cochange_count,
  }));

  return { file, imports, importers, cochanges };
}
