import { forceCenter, forceLink, forceManyBody, forceSimulation } from "d3-force-3d";
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

/** Finer grouping for file view so initial sphere has many visible clusters. */
function fileClusterKey(path: string): string {
  const parts = path.split("/");
  const dirParts = parts.slice(0, -1);
  if (dirParts.length === 0) return "(root)";
  const depth = Math.min(4, dirParts.length);
  return dirParts.slice(0, depth).join("/");
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
    .force("shell", forceShell(targetRadius * 0.6, 0.05) as any)
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

/** Directory path of a file (everything before last /) */
function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i > 0 ? path.slice(0, i) : "";
}

/** Build same-directory links — files in the same folder attract each other */
function buildDirLinks(paths: string[]): { source: string; target: string; depth: number }[] {
  const byDir = new Map<string, string[]>();
  for (const p of paths) {
    const dir = dirOf(p);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push(p);
  }

  const links: { source: string; target: string; depth: number }[] = [];
  for (const [dir, files] of byDir) {
    const depth = dir.split("/").length;
    // Connect each file to the next in the group (chain, not full mesh — O(n) not O(n²))
    for (let i = 0; i < files.length - 1; i++) {
      links.push({ source: files[i], target: files[i + 1], depth });
    }
  }
  return links;
}

/** Softly pull nodes toward a fixed shell radius around the origin. */
function forceShell(radius: number, strength: number) {
  let nodes: any[] = [];
  const force = (alpha: number) => {
    const k = strength * alpha;
    for (const n of nodes) {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const z = n.z ?? 0;
      const dist = Math.hypot(x, y, z) || 1;
      const delta = radius - dist;
      n.vx = (n.vx ?? 0) + (x / dist) * delta * k;
      n.vy = (n.vy ?? 0) + (y / dist) * delta * k;
      n.vz = (n.vz ?? 0) + (z / dist) * delta * k;
    }
  };
  force.initialize = (nextNodes: any[]) => {
    nodes = nextNodes;
  };
  return force;
}

/** Fibonacci sphere — evenly distributed points on a sphere surface */
function fibSphere(index: number, total: number, radius: number): [number, number, number] {
  if (total <= 1) return [0, 0, 0];
  const golden = Math.PI * (3 - Math.sqrt(5)); // golden angle
  const y = 1 - (index / (total - 1)) * 2; // -1 to 1
  const r = Math.sqrt(1 - y * y) * radius;
  const theta = golden * index;
  return [Math.cos(theta) * r, y * radius, Math.sin(theta) * r];
}

/** Pull nodes back to their seeded cluster center so first render keeps a sphere of clusters. */
function forceClusterAnchor(strength: number) {
  let nodes: any[] = [];
  const force = (alpha: number) => {
    const k = strength * alpha;
    for (const n of nodes) {
      n.vx = (n.vx ?? 0) + ((n._cx ?? 0) - (n.x ?? 0)) * k;
      n.vy = (n.vy ?? 0) + ((n._cy ?? 0) - (n.y ?? 0)) * k;
      n.vz = (n.vz ?? 0) + ((n._cz ?? 0) - (n.z ?? 0)) * k;
    }
  };
  force.initialize = (nextNodes: any[]) => {
    nodes = nextNodes;
  };
  return force;
}

/** File-level layout — all files, grouped into spherical directory clusters. */
export function layoutFiles(detail: GraphDetail): { nodes: FileLayoutNode[]; edges: FileLayoutEdge[] } {
  const files = detail.files;
  if (files.length === 0) return { nodes: [], edges: [] };

  const n = files.length;

  // Pre-compute indegree for heat ranking
  const indegreeMap = new Map<string, number>();
  for (const e of detail.edges) {
    indegreeMap.set(e.target, (indegreeMap.get(e.target) ?? 0) + 1);
  }
  const maxIn = Math.max(1, ...indegreeMap.values());

  // Keep deterministic order for stable first paint.
  const sorted = [...files].sort((a, b) => {
    const heatA = (indegreeMap.get(a.path) ?? 0) / maxIn;
    const heatB = (indegreeMap.get(b.path) ?? 0) / maxIn;
    if (heatB !== heatA) return heatB - heatA;
    return a.path.localeCompare(b.path);
  });

  const filesByCluster = new Map<string, typeof sorted>();
  for (const f of sorted) {
    const key = fileClusterKey(f.path);
    const group = filesByCluster.get(key) ?? [];
    group.push(f);
    filesByCluster.set(key, group);
  }

  const clusterEntries = [...filesByCluster.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const clusterShellRadius = Math.min(5.6, Math.max(2.8, Math.sqrt(clusterEntries.length) * 0.78));

  // Seed cluster centers on a sphere so initial view reads as a "galaxy shell".
  const clusterCenters = new Map<string, { x: number; y: number; z: number; localRadius: number }>();
  for (let i = 0; i < clusterEntries.length; i++) {
    const [cluster, clusterFiles] = clusterEntries[i];
    const [x, y, z] = fibSphere(i, clusterEntries.length, clusterShellRadius);
    clusterCenters.set(cluster, {
      x,
      y,
      z,
      localRadius: Math.min(1.45, Math.max(0.22, Math.cbrt(clusterFiles.length) * 0.2)),
    });
  }

  const nodes: any[] = [];
  for (const [cluster, clusterFiles] of clusterEntries) {
    const center = clusterCenters.get(cluster);
    if (!center) continue;
    for (let i = 0; i < clusterFiles.length; i++) {
      const f = clusterFiles[i];
      const heat = (indegreeMap.get(f.path) ?? 0) / maxIn;
      const localRadius = center.localRadius * (0.55 + (1 - heat) * 0.45);
      const [lx, ly, lz] = fibSphere(i, clusterFiles.length, localRadius);
      nodes.push({
        id: f.path,
        x: center.x + lx,
        y: center.y + ly,
        z: center.z + lz,
        language: f.language,
        hubScore: f.hubScore,
        isHub: f.isHub,
        cluster,
        _cx: center.x,
        _cy: center.y,
        _cz: center.z,
      });
    }
  }

  const nodeSet = new Set(files.map((f) => f.path));
  const validEdges: GraphFileEdge[] = detail.edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));

  const cochangeLinks = detail.cochanges
    .filter((c) => nodeSet.has(c.source) && nodeSet.has(c.target))
    .map((c) => ({ source: c.source, target: c.target }));

  const importLinks: any[] = validEdges.map((e) => ({ source: e.source, target: e.target }));
  const dirLinks = buildDirLinks(files.map((f) => f.path));

  const allLinks = [
    ...importLinks,
    ...cochangeLinks,
    ...dirLinks.map((l) => ({ source: l.source, target: l.target, _dir: true, _depth: l.depth })),
  ];

  const sim = forceSimulation(nodes, 3)
    .force(
      "charge",
      forceManyBody()
        .strength(-0.045)
        .distanceMax(clusterShellRadius * 0.4),
    )
    .force(
      "link",
      forceLink(allLinks)
        .id((d: any) => d.id)
        .distance((l: any) => (l._dir ? 0.14 : 0.3))
        .strength((l: any) => (l._dir ? 0.16 : 0.08)),
    )
    .force("center", forceCenter().strength(0.015))
    .force("cluster", forceClusterAnchor(1.15) as any)
    .force("shell", forceShell(clusterShellRadius, 0.22) as any)
    .stop();

  const ticks = n > 2500 ? 60 : n > 1200 ? 80 : n > 500 ? 100 : 120;
  for (let i = 0; i < ticks; i++) sim.tick();

  const clusterScale = 0.58;
  const localScale = 1.12;

  return {
    nodes: nodes.map((nd) => ({
      id: nd.id,
      x: (nd._cx ?? 0) * clusterScale + ((nd.x ?? 0) - (nd._cx ?? 0)) * localScale,
      y: (nd._cy ?? 0) * clusterScale + ((nd.y ?? 0) - (nd._cy ?? 0)) * localScale,
      z: (nd._cz ?? 0) * clusterScale + ((nd.z ?? 0) - (nd._cz ?? 0)) * localScale,
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
