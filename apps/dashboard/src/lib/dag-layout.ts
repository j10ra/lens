import type { GraphOverview } from "./graph-types.js";

export interface DagNode {
  id: string;
  layer: number;
  x: number;
  y: number;
  language: string | null;
  hubScore: number;
  isHub: boolean;
  importerCount: number;
  importCount: number;
}

export interface DagEdge {
  source: string;
  target: string;
}

export interface DagLayout {
  nodes: DagNode[];
  edges: DagEdge[];
  layerCount: number;
  layerSizes: number[]; // original count per layer (before cap)
}

const LAYER_HEIGHT = 90;
const NODE_SPACING = 28;
const MAX_PER_ROW = 40;
const MAX_PER_LAYER = 40;
const ROW_HEIGHT = 28;

/**
 * Layered DAG layout via longest-path layering.
 * Entry points (indegree=0) at layer 0, utilities/leaves at bottom.
 * Caps each layer to top MAX_PER_LAYER nodes by importance.
 */
export function layoutDag(overview: GraphOverview): DagLayout {
  const fileSet = new Set(overview.files.map((f) => f.path));
  const fileMeta = new Map(overview.files.map((f) => [f.path, f]));

  const allEdges = overview.edges.filter((e) => fileSet.has(e.source) && fileSet.has(e.target));

  // Build adjacency
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const id of fileSet) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }
  for (const e of allEdges) {
    outgoing.get(e.source)!.push(e.target);
    incoming.get(e.target)!.push(e.source);
  }

  // Longest-path layering via topological BFS
  const indegreeCount = new Map<string, number>();
  for (const id of fileSet) {
    indegreeCount.set(id, incoming.get(id)!.length);
  }

  const layer = new Map<string, number>();
  const queue: string[] = [];

  for (const id of fileSet) {
    if (indegreeCount.get(id) === 0) {
      layer.set(id, 0);
      queue.push(id);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const node = queue[head++];
    const nodeLayer = layer.get(node)!;
    for (const target of outgoing.get(node)!) {
      const currentLayer = layer.get(target);
      const candidateLayer = nodeLayer + 1;
      if (currentLayer === undefined || candidateLayer > currentLayer) {
        layer.set(target, candidateLayer);
      }
      const remaining = indegreeCount.get(target)! - 1;
      indegreeCount.set(target, remaining);
      if (remaining === 0) {
        queue.push(target);
      }
    }
  }

  // Handle cycles
  if (layer.size < fileSet.size) {
    const maxVisitedLayer = Math.max(0, ...Array.from(layer.values()));
    const middleLayer = Math.ceil(maxVisitedLayer / 2);
    for (const id of fileSet) {
      if (layer.has(id)) continue;
      const importers = incoming.get(id)!;
      let bestLayer = -1;
      for (const imp of importers) {
        const impLayer = layer.get(imp);
        if (impLayer !== undefined && impLayer + 1 > bestLayer) {
          bestLayer = impLayer + 1;
        }
      }
      layer.set(id, bestLayer >= 0 ? bestLayer : middleLayer);
    }
  }

  // Group by layer
  const layerGroups = new Map<number, string[]>();
  for (const [id, l] of layer) {
    const group = layerGroups.get(l) ?? [];
    group.push(id);
    layerGroups.set(l, group);
  }

  const layerCount = Math.max(0, ...Array.from(layerGroups.keys())) + 1;

  // Sort within each layer by edge count (importers+imports) desc, then hubScore
  for (const [, group] of layerGroups) {
    group.sort((a, b) => {
      const edgesA = (incoming.get(a)?.length ?? 0) + (outgoing.get(a)?.length ?? 0);
      const edgesB = (incoming.get(b)?.length ?? 0) + (outgoing.get(b)?.length ?? 0);
      if (edgesB !== edgesA) return edgesB - edgesA;
      const sa = fileMeta.get(a)?.hubScore ?? 0;
      const sb = fileMeta.get(b)?.hubScore ?? 0;
      return sb - sa;
    });
  }

  // Cap each layer, track original sizes
  const layerSizes: number[] = [];
  const includedIds = new Set<string>();

  for (let l = 0; l < layerCount; l++) {
    const group = layerGroups.get(l) ?? [];
    layerSizes.push(group.length);
    const capped = group.slice(0, MAX_PER_LAYER);
    layerGroups.set(l, capped);
    for (const id of capped) includedIds.add(id);
  }

  // Filter edges to only included nodes
  const edges: DagEdge[] = allEdges
    .filter((e) => includedIds.has(e.source) && includedIds.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  // Assign coordinates — grid layout within each layer band
  const nodes: DagNode[] = [];
  let yOffset = 0;

  for (let l = 0; l < layerCount; l++) {
    const group = layerGroups.get(l) ?? [];
    if (group.length === 0) {
      yOffset += LAYER_HEIGHT;
      continue;
    }

    const rowCount = Math.ceil(group.length / MAX_PER_ROW);

    for (let i = 0; i < group.length; i++) {
      const row = Math.floor(i / MAX_PER_ROW);
      const col = i % MAX_PER_ROW;
      const colsInRow = row < rowCount - 1 ? MAX_PER_ROW : group.length - row * MAX_PER_ROW;
      const rowWidth = (colsInRow - 1) * NODE_SPACING;

      const id = group[i];
      const meta = fileMeta.get(id);

      nodes.push({
        id,
        layer: l,
        x: -rowWidth / 2 + col * NODE_SPACING,
        y: yOffset + row * ROW_HEIGHT,
        language: meta?.language ?? null,
        hubScore: meta?.hubScore ?? 0,
        isHub: meta?.isHub ?? false,
        importerCount: incoming.get(id)?.length ?? 0,
        importCount: outgoing.get(id)?.length ?? 0,
      });
    }

    yOffset += LAYER_HEIGHT + (rowCount - 1) * ROW_HEIGHT;
  }

  return { nodes, edges, layerCount, layerSizes };
}

export { LAYER_HEIGHT, NODE_SPACING, ROW_HEIGHT, MAX_PER_LAYER };
