import { Badge, Separator } from "@lens/ui";
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Search, X } from "lucide-react";
import { type WheelEvent as ReactWheelEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { type DagEdge, type DagLayout, type DagNode, layoutDag } from "../lib/dag-layout.js";
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

// ── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  repoId,
  neighbors,
  loading,
  onNavigate,
  onClose,
}: {
  repoId: string;
  neighbors:
    | {
        file: {
          path: string;
          language: string | null;
          hubScore: number;
          isHub: boolean;
          exports: string[];
          symbols: { name: string; kind: string; line: number; exported: boolean }[];
          commits: number;
          recent90d: number;
        };
        imports: string[];
        importers: string[];
        cochanges: { path: string; weight: number }[];
      }
    | undefined;
  loading: boolean;
  onNavigate: (path: string) => void;
  onClose: () => void;
}) {
  const shortPath = (p: string) => p.split("/").pop() ?? p;
  const openInEditor = async (path: string, line?: number) => {
    try {
      await api.openFile(repoId, path, line);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to open editor: ${msg}`);
    }
  };

  if (loading) {
    return (
      <div className="w-80 shrink-0 border-l border-border bg-background overflow-y-auto flex items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!neighbors) return null;
  const file = neighbors.file;
  const color = languageColor(file.language);

  return (
    <div className="w-80 shrink-0 border-l border-border bg-background overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-mono font-semibold text-xs truncate">{shortPath(file.path)}</span>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground ml-2">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-3 text-xs">
        <div className="font-mono text-[10px] text-muted-foreground break-all">{file.path}</div>
        <button
          type="button"
          onClick={() => void openInEditor(file.path)}
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <ExternalLink className="h-3 w-3" />
          Open in editor
        </button>

        {/* Badges */}
        <div className="flex gap-1.5 flex-wrap">
          {file.language && (
            <Badge variant="secondary" className="text-[10px]">
              {file.language}
            </Badge>
          )}
          {file.isHub && (
            <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-400">
              hub
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            score {file.hubScore.toFixed(2)}
          </Badge>
        </div>

        {/* Git stats */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded bg-muted/50 px-2 py-1 text-center">
            <div className="font-semibold text-sm">{file.commits}</div>
            <div className="text-[9px] text-muted-foreground">commits</div>
          </div>
          <div className="rounded bg-muted/50 px-2 py-1 text-center">
            <div className="font-semibold text-sm">{file.recent90d}</div>
            <div className="text-[9px] text-muted-foreground">90d</div>
          </div>
          <div className="rounded bg-muted/50 px-2 py-1 text-center">
            <div className="font-semibold text-sm">{neighbors.imports.length + neighbors.importers.length}</div>
            <div className="text-[9px] text-muted-foreground">edges</div>
          </div>
        </div>

        {/* Exports */}
        {file.exports.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="text-muted-foreground font-medium mb-1">Exports ({file.exports.length})</div>
              <div className="flex flex-wrap gap-1">
                {file.exports.slice(0, 12).map((e) => (
                  <span key={e} className="font-mono text-[10px] bg-muted/60 px-1.5 py-0.5 rounded">
                    {e}
                  </span>
                ))}
                {file.exports.length > 12 && (
                  <span className="text-[10px] text-muted-foreground">+{file.exports.length - 12}</span>
                )}
              </div>
            </div>
          </>
        )}

        {/* Symbols */}
        {file.symbols.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="text-muted-foreground font-medium mb-1">Symbols ({file.symbols.length})</div>
              <div className="space-y-0.5">
                {file.symbols.slice(0, 12).map((sym) => (
                  <button
                    key={`${sym.kind}:${sym.name}:${sym.line}`}
                    type="button"
                    onClick={() => void openInEditor(file.path, sym.line)}
                    className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-[10px] hover:bg-muted/50"
                  >
                    <Badge variant="outline" className="h-4 px-1 font-mono text-[9px] lowercase">
                      {sym.kind}
                    </Badge>
                    <span className="flex-1 truncate font-mono">{sym.name}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">L{sym.line}</span>
                  </button>
                ))}
                {file.symbols.length > 12 && (
                  <span className="text-[10px] text-muted-foreground">+{file.symbols.length - 12} more</span>
                )}
              </div>
            </div>
          </>
        )}

        {/* Importers */}
        {neighbors.importers.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center gap-1.5 text-muted-foreground font-medium mb-1">
                <ArrowDownLeft className="h-3 w-3 text-green-400" />
                Imported by ({neighbors.importers.length})
              </div>
              <div className="space-y-0.5">
                {neighbors.importers.slice(0, 10).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onNavigate(p)}
                    className="block w-full truncate text-left font-mono text-[10px] text-foreground/80 hover:text-primary pl-4"
                  >
                    {p}
                  </button>
                ))}
                {neighbors.importers.length > 10 && (
                  <div className="text-[10px] text-muted-foreground pl-4">+{neighbors.importers.length - 10} more</div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Imports */}
        {neighbors.imports.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center gap-1.5 text-muted-foreground font-medium mb-1">
                <ArrowUpRight className="h-3 w-3 text-blue-400" />
                Imports ({neighbors.imports.length})
              </div>
              <div className="space-y-0.5">
                {neighbors.imports.slice(0, 10).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onNavigate(p)}
                    className="block w-full truncate text-left font-mono text-[10px] text-foreground/80 hover:text-primary pl-4"
                  >
                    {p}
                  </button>
                ))}
                {neighbors.imports.length > 10 && (
                  <div className="text-[10px] text-muted-foreground pl-4">+{neighbors.imports.length - 10} more</div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Cochanges */}
        {neighbors.cochanges.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center gap-1.5 text-muted-foreground font-medium mb-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
                Co-changes ({neighbors.cochanges.length})
              </div>
              <div className="space-y-0.5">
                {neighbors.cochanges.slice(0, 10).map((c) => (
                  <button
                    key={c.path}
                    type="button"
                    onClick={() => onNavigate(c.path)}
                    className="flex w-full items-center gap-1 truncate text-left font-mono text-[10px] text-foreground/80 hover:text-primary pl-4"
                  >
                    <span className="truncate">{shortPath(c.path)}</span>
                    <span className="text-amber-400/70 shrink-0">x{c.weight}</span>
                  </button>
                ))}
                {neighbors.cochanges.length > 10 && (
                  <div className="text-[10px] text-muted-foreground pl-4">+{neighbors.cochanges.length - 10} more</div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Legend */}
        <Separator />
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-blue-400" />
            imports
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-green-400" />
            importers
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-amber-400 border-dashed" />
            cochange
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function NavigatorTab({ repoId }: { repoId: string }) {
  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);
  const { data: overview, isLoading } = useGraphOverview(repo?.root_path, "", 2000);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const { data: neighbors, isLoading: neighborsLoading } = useGraphNeighbors(repo?.root_path, selectedFile);

  const [search, setSearch] = useState("");
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

  // Search results
  const searchResults = useMemo(() => {
    if (!search || !layout) return [];
    const q = search.toLowerCase();
    return layout.nodes
      .filter((n) => n.id.toLowerCase().includes(q))
      .sort((a, b) => b.hubScore - a.hubScore)
      .slice(0, 20);
  }, [search, layout]);

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

  // Zoom to fit on initial load
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!layout || !svgRef.current || initializedRef.current) return;
    initializedRef.current = true;
    zoomToFit();
  }, [layout, zoomToFit]);

  // Pan to selected node
  useEffect(() => {
    if (!selectedFile || !svgRef.current) return;
    const node = nodeMap.get(selectedFile);
    if (!node) return;
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();

    setPan({
      x: rect.width / 2 - node.x * zoom - 160, // offset for detail panel
      y: rect.height / 2 - node.y * zoom,
    });
  }, [selectedFile, nodeMap, zoom]);

  // Escape to deselect
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedFile(null);
        setSearch("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
    setSelectedFile(null);
  }, [zoomToFit]);

  const handleNodeSelect = useCallback((id: string) => {
    setSelectedFile(id);
    setSearch("");
  }, []);

  const handleNavigate = useCallback((path: string) => {
    setSelectedFile(path);
  }, []);

  if (!repoId) return null;

  return (
    <div className="flex flex-1 min-h-0">
      {/* Main SVG area */}
      <div className="relative flex-1 min-h-0 overflow-hidden bg-background">
        {/* Search bar */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-background/95 backdrop-blur-sm px-2 shadow-sm">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files..."
              className="h-7 w-52 bg-transparent text-xs focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {search && searchResults.length > 0 && (
            <div className="rounded-md border border-border bg-background/95 backdrop-blur-sm shadow-lg max-h-64 overflow-y-auto">
              {searchResults.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleNodeSelect(n.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/50"
                >
                  <span
                    className="shrink-0 w-2 h-2 rounded-full"
                    style={{ backgroundColor: languageColor(n.language) }}
                  />
                  <span className="font-mono truncate">{n.id}</span>
                  {n.isHub && (
                    <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-400 ml-auto">
                      hub
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stats + controls */}
        {layout && (
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
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
        )}

        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !layout ? (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <div className="text-xs text-muted-foreground">No import graph data available.</div>
          </div>
        ) : (
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
        )}

        {/* Hover tooltip */}
        {hoveredNode && !selectedFile && <Tooltip node={hoveredNode} x={mousePos.x} y={mousePos.y} />}
      </div>

      {/* Right detail panel */}
      {selectedFile && (
        <DetailPanel
          repoId={repoId}
          neighbors={neighbors}
          loading={neighborsLoading}
          onNavigate={handleNavigate}
          onClose={() => setSelectedFile(null)}
        />
      )}
    </div>
  );
}
