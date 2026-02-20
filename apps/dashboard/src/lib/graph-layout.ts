import { forceCenter, forceLink, forceManyBody, forceRadial, forceSimulation } from "d3-force-3d";
import type { GraphCluster, GraphClusterEdge, GraphDetail, GraphFileEdge } from "./graph-types.js";

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  z: number;
  fileCount: number;
  languages: Record<string, number>;
}

export interface LayoutEdge {
  source: string;
  target: string;
  count: number;
}

export interface FileLayoutNode {
  id: string;
  x: number;
  y: number;
  z: number;
  language: string | null;
  hubScore: number;
  isHub: boolean;
  cluster: string;
}

export interface FileLayoutEdge {
  source: string;
  target: string;
}

/** Derive cluster key from file path — first 2 segments */
function clusterKey(path: string): string {
  const parts = path.split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
}

/** Cluster-level layout using d3-force-3d */
export function layoutClusters(
  clusters: GraphCluster[],
  edges: GraphClusterEdge[],
): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const targetRadius = Math.max(15, Math.sqrt(clusters.length) * 5);

  const nodes: any[] = clusters.map((c) => ({
    id: c.key,
    x: (Math.random() - 0.5) * targetRadius,
    y: (Math.random() - 0.5) * targetRadius,
    z: (Math.random() - 0.5) * targetRadius * 0.4,
    fileCount: c.fileCount,
    languages: c.languages ?? {},
  }));

  const links: any[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
    count: e.weight,
  }));

  const sim = forceSimulation(nodes, 3)
    .force("charge", forceManyBody().strength(-15))
    .force(
      "link",
      forceLink(links)
        .id((d: any) => d.id)
        .distance(10),
    )
    .force("center", forceCenter())
    .force("radial", forceRadial(targetRadius * 0.6).strength(0.05))
    .stop();

  for (let i = 0; i < 300; i++) sim.tick();

  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      x: n.x ?? 0,
      y: n.y ?? 0,
      z: n.z ?? 0,
      fileCount: n.fileCount,
      languages: n.languages,
    })),
    edges: links.map((l) => ({
      source: typeof l.source === "string" ? l.source : l.source.id,
      target: typeof l.target === "string" ? l.target : l.target.id,
      count: l.count,
    })),
  };
}

/** File-level layout — positions individual files, grouped by directory cluster */
export function layoutFiles(detail: GraphDetail): { nodes: FileLayoutNode[]; edges: FileLayoutEdge[] } {
  const n = detail.files.length;
  const targetRadius = Math.max(10, Math.sqrt(n) * 2);

  const nodes: any[] = detail.files.map((f) => ({
    id: f.path,
    x: (Math.random() - 0.5) * targetRadius,
    y: (Math.random() - 0.5) * targetRadius,
    z: (Math.random() - 0.5) * targetRadius * 0.25,
    language: f.language,
    hubScore: f.hubScore,
    isHub: f.isHub,
    cluster: clusterKey(f.path),
  }));

  const nodeSet = new Set(detail.files.map((f) => f.path));

  const validEdges: GraphFileEdge[] = detail.edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));

  // Co-change edges also act as layout links (pulls co-changed files together)
  const cochangeLinks = detail.cochanges
    .filter((c) => nodeSet.has(c.source) && nodeSet.has(c.target))
    .map((c) => ({ source: c.source, target: c.target }));

  const importLinks: any[] = validEdges.map((e) => ({ source: e.source, target: e.target }));
  const allLinks = [...importLinks, ...cochangeLinks];

  const sim = forceSimulation(nodes, 3)
    .force("charge", forceManyBody().strength(-3).distanceMax(targetRadius))
    .force(
      "link",
      forceLink(allLinks)
        .id((d: any) => d.id)
        .distance(3)
        .strength(0.4),
    )
    .force("center", forceCenter())
    .force("radial", forceRadial(targetRadius * 0.4).strength(0.08))
    .stop();

  for (let i = 0; i < 300; i++) sim.tick();

  return {
    nodes: nodes.map((nd) => ({
      id: nd.id,
      x: nd.x ?? 0,
      y: nd.y ?? 0,
      z: nd.z ?? 0,
      language: nd.language,
      hubScore: nd.hubScore,
      isHub: nd.isHub,
      cluster: nd.cluster,
    })),
    edges: importLinks.map((l) => ({
      source: typeof l.source === "string" ? l.source : l.source.id,
      target: typeof l.target === "string" ? l.target : l.target.id,
    })),
  };
}
