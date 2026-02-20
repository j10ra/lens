import type { Db } from "../db/connection.js";
import { graphQueries, metadataQueries } from "../db/queries.js";
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

export interface GraphFileNode {
  path: string;
  language: string | null;
  exports: string[];
  hubScore: number;
  isHub: boolean;
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

  const files: GraphFileNode[] = dirFiles.map((f) => {
    const indegree = indegrees.get(f.path) ?? 0;
    let exports: string[] = [];
    try {
      exports = f.exports ? JSON.parse(f.exports) : [];
    } catch {
      // malformed JSON — default to empty
    }
    return {
      path: f.path,
      language: f.language,
      exports,
      hubScore: indegree / maxIndegree,
      isHub: indegree >= 5,
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
