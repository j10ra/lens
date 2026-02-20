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

/** Fibonacci sphere — evenly distributed points on a sphere surface */
function fibSphere(index: number, total: number, radius: number): [number, number, number] {
  const golden = Math.PI * (3 - Math.sqrt(5)); // golden angle
  const y = 1 - (index / (total - 1)) * 2; // -1 to 1
  const r = Math.sqrt(1 - y * y) * radius;
  const theta = golden * index;
  return [Math.cos(theta) * r, y * radius, Math.sin(theta) * r];
}

/** Code file extensions worth visualizing */
const CODE_LANGS = new Set(["typescript", "javascript", "css", "shell"]);

/** File-level layout — spherical: hot files center, cold files outer shell */
export function layoutFiles(detail: GraphDetail): { nodes: FileLayoutNode[]; edges: FileLayoutEdge[] } {
  // Filter to code files only — drop .md, .json, config noise
  const codeFiles = detail.files.filter((f) => f.language && CODE_LANGS.has(f.language));
  const files = codeFiles.length > 0 ? codeFiles : detail.files;

  const n = files.length;
  const outerRadius = Math.max(3, Math.sqrt(n) * 0.4);

  // Pre-compute indegree for initial placement
  const indegreeMap = new Map<string, number>();
  for (const e of detail.edges) {
    indegreeMap.set(e.target, (indegreeMap.get(e.target) ?? 0) + 1);
  }
  const maxIn = Math.max(1, ...indegreeMap.values());

  // Sort files: hottest first (center) → coldest last (outer shell)
  const sorted = [...files].sort((a, b) => {
    const heatA = (indegreeMap.get(a.path) ?? 0) / maxIn;
    const heatB = (indegreeMap.get(b.path) ?? 0) / maxIn;
    return heatB - heatA;
  });

  // Place on fibonacci sphere — hot files at small radius, cold at outer
  const nodes: any[] = sorted.map((f, i) => {
    const heat = (indegreeMap.get(f.path) ?? 0) / maxIn;
    const shellRadius = outerRadius * (0.1 + (1 - heat) * 0.9);
    const [x, y, z] = fibSphere(i, n, shellRadius);
    return {
      id: f.path,
      x,
      y,
      z,
      language: f.language,
      hubScore: f.hubScore,
      isHub: f.isHub,
      cluster: clusterKey(f.path),
      _heat: heat,
    };
  });

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
        .strength(-0.3)
        .distanceMax(outerRadius * 0.5),
    )
    .force(
      "link",
      forceLink(allLinks)
        .id((d: any) => d.id)
        .distance((l: any) => (l._dir ? 0.3 : 0.6))
        .strength((l: any) => (l._dir ? 0.7 : 0.4)),
    )
    .force("center", forceCenter())
    .force("radial", forceRadial((d: any) => outerRadius * (0.1 + (1 - (d._heat ?? 0)) * 0.9)).strength(0.2))
    .stop();

  for (let i = 0; i < 400; i++) sim.tick();

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
