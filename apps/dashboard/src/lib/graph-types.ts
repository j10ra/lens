export interface GraphCluster {
  key: string;
  fileCount: number;
  languages?: Record<string, number>;
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
  hubScore: number;
  isHub: boolean;
  exports: string[];
  symbols: GraphSymbol[];
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
