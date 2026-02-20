import type { GraphCluster, GraphClusterEdge } from "./graph-types.js";

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

export async function layoutClusters(
  clusters: GraphCluster[],
  edges: GraphClusterEdge[],
): Promise<{ nodes: LayoutNode[]; edges: LayoutEdge[] }> {
  const d3 = await import("d3-force-3d");

  const nodes: any[] = clusters.map((c) => ({
    id: c.key,
    x: 0,
    y: 0,
    z: 0,
    fileCount: c.fileCount,
    languages: c.languages ?? {},
  }));

  const links: any[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
    count: e.weight,
  }));

  const sim = d3
    .forceSimulation(nodes, 3)
    .force("charge", d3.forceManyBody().strength(-100))
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d: any) => d.id)
        .distance(50),
    )
    .force("center", d3.forceCenter())
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
