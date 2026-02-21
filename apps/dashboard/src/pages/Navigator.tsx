import { type WheelEvent as ReactWheelEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type DagEdge, type DagLayout, type DagNode, layoutDag } from "../lib/dag-layout.js";
import type { FileNeighborhood, GraphOverview } from "../lib/graph-types.js";
import { languageColor } from "../lib/language-colors.js";
import { useGraphNeighbors, useGraphOverview } from "../queries/use-repo-graph.js";
import { useRepos } from "../queries/use-repos.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 6;
const PADDING = 60;
const NODE_RADIUS_BASE = 4;
const NODE_RADIUS_HUB = 8;

// ── SVG Edge Rendering ───────────────────────────────────────────────────────

function bezierPath(sx: number, sy: number, tx: number, ty: number): string {
  const dy = ty - sy;
  const cy1 = sy + dy * 0.35;
  const cy2 = ty - dy * 0.35;
  return `M${sx},${sy} C${sx},${cy1} ${tx},${cy2} ${tx},${ty}`;
}

function DagEdges({
  edges,
  nodeMap,
  selectedId,
  highlightImports,
  highlightImporters,
}: {
  edges: DagEdge[];
  nodeMap: Map<string, DagNode>;
  selectedId: string | null;
  highlightImports: Set<string> | null;
  highlightImporters: Set<string> | null;
}) {
  return (
    <g>
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 8 6"
          refX="8"
          refY="3"
          markerWidth="6"
          markerHeight="4"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L8,3 L0,6 Z" fill="currentColor" opacity="0.3" />
        </marker>
        <marker
          id="arrow-import"
          viewBox="0 0 8 6"
          refX="8"
          refY="3"
          markerWidth="6"
          markerHeight="4"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L8,3 L0,6 Z" fill="#3b82f6" opacity="0.8" />
        </marker>
        <marker
          id="arrow-importer"
          viewBox="0 0 8 6"
          refX="8"
          refY="3"
          markerWidth="6"
          markerHeight="4"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L8,3 L0,6 Z" fill="#22c55e" opacity="0.8" />
        </marker>
      </defs>
      {edges.map((e) => {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) return null;

        const isImport = selectedId && highlightImports && e.source === selectedId && highlightImports.has(e.target);
        const isImporter =
          selectedId && highlightImporters && e.target === selectedId && highlightImporters.has(e.source);
        const isHighlighted = isImport || isImporter;
        const isDimmed = selectedId && !isHighlighted;

        const color = isImport ? "#3b82f6" : isImporter ? "#22c55e" : "currentColor";
        const marker = isImport ? "url(#arrow-import)" : isImporter ? "url(#arrow-importer)" : "url(#arrow)";

        return (
          <path
            key={`${e.source}->${e.target}`}
            d={bezierPath(s.x, s.y, t.x, t.y)}
            fill="none"
            stroke={color}
            strokeWidth={isHighlighted ? 1.5 : 0.5}
            opacity={isDimmed ? 0.04 : isHighlighted ? 0.7 : 0.15}
            markerEnd={marker}
          />
        );
      })}
    </g>
  );
}

// ── SVG Node Rendering ───────────────────────────────────────────────────────

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function DagNodes({
  nodes,
  selectedId,
  connectedIds,
  onSelect,
  onHover,
}: {
  nodes: DagNode[];
  selectedId: string | null;
  connectedIds: Set<string> | null;
  onSelect: (id: string) => void;
  onHover: (node: DagNode | null) => void;
}) {
  return (
    <g>
      {nodes.map((node) => {
        const color = languageColor(node.language);
        const r = NODE_RADIUS_BASE + (NODE_RADIUS_HUB - NODE_RADIUS_BASE) * node.hubScore;
        const isSelected = node.id === selectedId;
        const isConnected = connectedIds?.has(node.id) ?? false;
        const isDimmed = selectedId !== null && !isSelected && !isConnected;

        return (
          <g
            key={node.id}
            transform={`translate(${node.x},${node.y})`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(node.id);
            }}
            onMouseEnter={() => onHover(node)}
            onMouseLeave={() => onHover(null)}
            style={{ cursor: "pointer" }}
            opacity={isDimmed ? 0.12 : 1}
          >
            {/* Hub glow ring */}
            {node.isHub && !isDimmed && <circle r={r + 3} fill="none" stroke={color} strokeWidth={1} opacity={0.3} />}
            {/* Node circle */}
            <circle
              r={r}
              fill={color}
              stroke={isSelected ? "#ffffff" : "none"}
              strokeWidth={isSelected ? 1.5 : 0}
              opacity={isDimmed ? 0.3 : 0.85}
            />
            {/* Selected pulse */}
            {isSelected && (
              <circle r={r + 4} fill="none" stroke="#ffffff" strokeWidth={0.5} opacity={0.4}>
                <animate attributeName="r" from={r + 3} to={r + 10} dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.4" to="0" dur="1.5s" repeatCount="indefinite" />
              </circle>
            )}
            {/* Label */}
            <text
              x={r + 4}
              y={3}
              fontSize={8}
              fontFamily="ui-monospace, monospace"
              fill="currentColor"
              opacity={isDimmed ? 0.2 : isSelected || isConnected ? 0.95 : 0.6}
            >
              {basename(node.id)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ── Layer Bands ──────────────────────────────────────────────────────────────

function LayerBands({
  nodes,
  layerCount,
  layerSizes,
  minX,
  maxX,
}: {
  nodes: DagNode[];
  layerCount: number;
  layerSizes: number[];
  minX: number;
  maxX: number;
}) {
  // Compute Y range per layer from actual node positions
  const layerY = new Map<number, { min: number; max: number }>();
  for (const n of nodes) {
    const cur = layerY.get(n.layer);
    if (!cur) {
      layerY.set(n.layer, { min: n.y, max: n.y });
    } else {
      if (n.y < cur.min) cur.min = n.y;
      if (n.y > cur.max) cur.max = n.y;
    }
  }

  const width = maxX - minX + PADDING * 2;

  return (
    <g>
      {Array.from({ length: layerCount }, (_, i) => {
        const range = layerY.get(i);
        if (!range) return null;
        const bandTop = range.min - 16;
        const bandBottom = range.max + 16;
        const bandH = bandBottom - bandTop;
        const isEven = i % 2 === 0;
        const total = layerSizes[i] ?? 0;
        const label = i === 0 ? "Entry Points" : i === layerCount - 1 ? "Leaves" : `Layer ${i}`;
        const countLabel =
          total > nodes.filter((n) => n.layer === i).length
            ? ` (${nodes.filter((n) => n.layer === i).length}/${total})`
            : "";

        return (
          <g key={`band-${i}`}>
            {isEven && (
              <rect x={minX - PADDING} y={bandTop} width={width} height={bandH} fill="currentColor" opacity={0.025} />
            )}
            <text
              x={minX - PADDING + 8}
              y={range.min + 3}
              fontSize={7}
              fontFamily="ui-monospace, monospace"
              fill="currentColor"
              opacity={0.3}
            >
              {label}
              {countLabel}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ── Cochange Edges (dashed) ──────────────────────────────────────────────────

function CochangeEdges({
  selectedId,
  cochangePaths,
  nodeMap,
}: {
  selectedId: string;
  cochangePaths: string[];
  nodeMap: Map<string, DagNode>;
}) {
  const source = nodeMap.get(selectedId);
  if (!source) return null;

  return (
    <g>
      {cochangePaths.map((p) => {
        const target = nodeMap.get(p);
        if (!target) return null;
        return (
          <path
            key={`cc-${selectedId}-${p}`}
            d={bezierPath(source.x, source.y, target.x, target.y)}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={1}
            strokeDasharray="6 3"
            opacity={0.5}
          />
        );
      })}
    </g>
  );
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ node, x, y }: { node: DagNode; x: number; y: number }) {
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg"
      style={{ left: x + 14, top: y - 10 }}
    >
      <div className="font-mono font-medium text-foreground">{node.id}</div>
      <div className="mt-1 flex gap-3 text-muted-foreground">
        <span>hub: {node.hubScore.toFixed(2)}</span>
        <span>imports: {node.importCount}</span>
        <span>importers: {node.importerCount}</span>
        <span>layer: {node.layer}</span>
      </div>
    </div>
  );
}

// ── DagView — reusable, props-driven DAG visualization ──────────────────────

export interface DagViewProps {
  overview: GraphOverview;
  selectedFile: string | null;
  neighbors: FileNeighborhood | undefined;
  neighborsLoading: boolean;
  onSelectFile: (path: string) => void;
  onClearSelection: () => void;
}

export function DagView({
  overview,
  selectedFile,
  neighbors,
  neighborsLoading,
  onSelectFile,
  onClearSelection,
}: DagViewProps) {
  const [hoveredNode, setHoveredNode] = useState<DagNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Pan/zoom state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  // Compute layout
  const layout = useMemo<DagLayout | null>(() => {
    if (!overview || overview.files.length === 0) return null;
    return layoutDag(overview);
  }, [overview]);

  // Node map for quick lookup
  const nodeMap = useMemo(() => {
    if (!layout) return new Map<string, DagNode>();
    return new Map(layout.nodes.map((n) => [n.id, n]));
  }, [layout]);

  // Bounds
  const bounds = useMemo(() => {
    if (!layout || layout.nodes.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of layout.nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    return { minX, maxX, minY, maxY };
  }, [layout]);

  // Connected IDs for focus mode dimming
  const connectedIds = useMemo(() => {
    if (!selectedFile) return null;
    const ids = new Set<string>([selectedFile]);
    if (neighbors) {
      for (const p of neighbors.imports) ids.add(p);
      for (const p of neighbors.importers) ids.add(p);
      for (const c of neighbors.cochanges) ids.add(c.path);
    } else if (layout) {
      for (const e of layout.edges) {
        if (e.source === selectedFile) ids.add(e.target);
        if (e.target === selectedFile) ids.add(e.source);
      }
    }
    return ids;
  }, [selectedFile, neighbors, layout]);

  // Import/importer highlight sets
  const highlightImports = useMemo(() => {
    if (!selectedFile) return null;
    const ids = new Set<string>();
    if (neighbors) {
      for (const p of neighbors.imports) ids.add(p);
    } else if (layout) {
      for (const e of layout.edges) {
        if (e.source === selectedFile) ids.add(e.target);
      }
    }
    return ids;
  }, [selectedFile, neighbors, layout]);

  const highlightImporters = useMemo(() => {
    if (!selectedFile) return null;
    const ids = new Set<string>();
    if (neighbors) {
      for (const p of neighbors.importers) ids.add(p);
    } else if (layout) {
      for (const e of layout.edges) {
        if (e.target === selectedFile) ids.add(e.source);
      }
    }
    return ids;
  }, [selectedFile, neighbors, layout]);

  // Cochange paths for selected file
  const cochangePaths = useMemo(() => {
    if (!selectedFile || !neighbors) return [];
    return neighbors.cochanges.map((c) => c.path);
  }, [selectedFile, neighbors]);

  // Zoom to fit all
  const zoomToFit = useCallback(() => {
    if (!layout || !svgRef.current) return;
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const w = bounds.maxX - bounds.minX + PADDING * 2;
    const h = bounds.maxY - bounds.minY + PADDING * 2;
    if (w === 0 || h === 0) return;

    const scaleX = rect.width / w;
    const scaleY = rect.height / h;
    const newZoom = Math.min(scaleX, scaleY, MAX_ZOOM);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;

    setZoom(newZoom);
    setPan({
      x: rect.width / 2 - cx * newZoom,
      y: rect.height / 2 - cy * newZoom,
    });
  }, [layout, bounds]);

  // Zoom to fit on initial load / when overview changes
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!layout || !svgRef.current) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      zoomToFit();
    }
  }, [layout, zoomToFit]);

  // Re-fit when overview data changes (e.g. filter toggle)
  const prevOverviewRef = useRef(overview);
  useEffect(() => {
    if (overview !== prevOverviewRef.current) {
      prevOverviewRef.current = overview;
      // Delay to let layout recompute
      requestAnimationFrame(() => zoomToFit());
    }
  }, [overview, zoomToFit]);

  // Pan to selected node
  useEffect(() => {
    if (!selectedFile || !svgRef.current) return;
    const node = nodeMap.get(selectedFile);
    if (!node) return;
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();

    setPan({
      x: rect.width / 2 - node.x * zoom - 160,
      y: rect.height / 2 - node.y * zoom,
    });
  }, [selectedFile, nodeMap, zoom]);

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOrigin.current = { ...pan };
    },
    [pan],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    if (!isPanning.current) return;
    setPan({
      x: panOrigin.current.x + (e.clientX - panStart.current.x),
      y: panOrigin.current.y + (e.clientY - panStart.current.y),
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Wheel zoom
  const handleWheel = useCallback(
    (e: ReactWheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));

      setPan({
        x: mx - (mx - pan.x) * (newZoom / zoom),
        y: my - (my - pan.y) * (newZoom / zoom),
      });
      setZoom(newZoom);
    },
    [zoom, pan],
  );

  const handleDoubleClick = useCallback(() => {
    zoomToFit();
    onClearSelection();
  }, [zoomToFit, onClearSelection]);

  const handleNodeSelect = useCallback(
    (id: string) => {
      onSelectFile(id);
    },
    [onSelectFile],
  );

  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <div className="text-xs text-muted-foreground">No import graph data available.</div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Stats + controls */}
      <div className="absolute bottom-3 left-44 z-10 flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
        <span>{layout.nodes.length} files</span>
        <span>{layout.edges.length} edges</span>
        <span>{layout.layerCount} layers</span>
        <button
          type="button"
          onClick={handleDoubleClick}
          className="ml-1 rounded border border-border bg-background/90 px-2 py-0.5 hover:bg-accent hover:text-foreground"
        >
          Fit all
        </button>
      </div>

      <svg
        ref={svgRef}
        className="h-full w-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: isPanning.current ? "grabbing" : "grab" }}
      >
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          <LayerBands
            nodes={layout.nodes}
            layerCount={layout.layerCount}
            layerSizes={layout.layerSizes}
            minX={bounds.minX}
            maxX={bounds.maxX}
          />
          <DagEdges
            edges={layout.edges}
            nodeMap={nodeMap}
            selectedId={selectedFile}
            highlightImports={highlightImports}
            highlightImporters={highlightImporters}
          />
          {selectedFile && cochangePaths.length > 0 && (
            <CochangeEdges selectedId={selectedFile} cochangePaths={cochangePaths} nodeMap={nodeMap} />
          )}
          <DagNodes
            nodes={layout.nodes}
            selectedId={selectedFile}
            connectedIds={connectedIds}
            onSelect={handleNodeSelect}
            onHover={setHoveredNode}
          />
        </g>
      </svg>

      {/* Hover tooltip */}
      {hoveredNode && !selectedFile && <Tooltip node={hoveredNode} x={mousePos.x} y={mousePos.y} />}
    </div>
  );
}

// ── Standalone wrapper (for testing / direct use) ───────────────────────────

export function NavigatorTab({ repoId }: { repoId: string }) {
  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);
  const { data: overview, isLoading } = useGraphOverview(repo?.root_path, "", 2000);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const { data: neighbors, isLoading: neighborsLoading } = useGraphNeighbors(repo?.root_path, selectedFile);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedFile(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!repoId) return null;

  if (isLoading) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!overview || overview.files.length === 0) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center px-8 text-center">
        <div className="text-xs text-muted-foreground">No import graph data available.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      <DagView
        overview={overview}
        selectedFile={selectedFile}
        neighbors={neighbors}
        neighborsLoading={neighborsLoading}
        onSelectFile={setSelectedFile}
        onClearSelection={() => setSelectedFile(null)}
      />
    </div>
  );
}
