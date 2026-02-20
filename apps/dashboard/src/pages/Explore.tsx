import { Badge, PageHeader } from "@lens/ui";
import { Billboard, Line, OrbitControls, Text } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
// biome-ignore lint/performance/noBarrelFile: need all icons
import { ArrowLeft, ChevronRight, Folder } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { CameraController } from "../components/explore/CameraController.js";
import { CommandPalette } from "../components/explore/CommandPalette.js";
import { StatusBadge } from "../components/StatusBadge.js";
import type { FileLayoutEdge, FileLayoutNode } from "../lib/graph-layout.js";
import { layoutFiles } from "../lib/graph-layout.js";
import type { GraphCochange, GraphDetail } from "../lib/graph-types.js";
import { languageColor } from "../lib/language-colors.js";
import { useGraphDetail } from "../queries/use-repo-graph.js";
import { useRepos } from "../queries/use-repos.js";

// ── 3D Components ────────────────────────────────────────────────────────────

function spherePoint(index: number, total: number, radius: number): [number, number, number] {
  if (total <= 1) return [radius, 0, 0];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / (total - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y)) * radius;
  const theta = golden * index;
  return [Math.cos(theta) * r, y * radius, Math.sin(theta) * r];
}

function FileNode({
  node,
  selected,
  dimmed,
  showLabel = false,
  onSelect,
}: {
  node: FileLayoutNode;
  selected: boolean;
  dimmed: boolean;
  showLabel?: boolean;
  onSelect: (id: string) => void;
}) {
  const color = languageColor(node.language);
  const fileName = node.id.split("/").pop() ?? node.id;
  const label = fileName.length > 22 ? `${fileName.slice(0, 21)}…` : fileName;

  // Scale by heat (hubScore 0–1) — sqrt for better spread across low values
  const heat = Math.sqrt(Math.min(1, Math.max(0, node.hubScore)));
  const dotRadius = selected ? 0.022 + heat * 0.1 : 0.016 + heat * 0.075;
  const fontSize = selected ? 0.085 + heat * 0.09 : 0.055 + heat * 0.065;
  const textOpacity = dimmed ? 0.25 : selected ? 0.98 : 0.7 + heat * 0.24;

  return (
    <Billboard
      position={[node.x, node.y, node.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
    >
      {/* Language color dot — size scales with heat */}
      <mesh position={[0, 0, 0.01]}>
        <circleGeometry args={[dotRadius, 32]} />
        <meshBasicMaterial
          color={selected ? "#ffffff" : color}
          transparent
          opacity={dimmed ? 0.16 : 0.32 + heat * 0.62}
        />
      </mesh>
      {/* Filename — size and brightness scale with heat */}
      {showLabel && (
        <Text
          position={[dotRadius + 0.04, 0, 0]}
          fontSize={fontSize}
          anchorX="left"
          anchorY="middle"
          maxWidth={2.8}
          color={
            dimmed ? "#64748b" : selected ? "#ffffff" : heat > 0.35 ? "#f8fafc" : heat > 0.12 ? "#cbd5e1" : "#94a3b8"
          }
          outlineWidth={dimmed ? 0.003 : selected ? 0.016 : 0.01}
          outlineColor="#020617"
          outlineBlur={selected ? 0.15 : 0.06}
          fontWeight={heat > 0.22 || selected ? "bold" : "normal"}
        >
          {label}
          <meshBasicMaterial transparent opacity={textOpacity} />
        </Text>
      )}
    </Billboard>
  );
}

function ImportEdges({
  nodes,
  edges,
  selectedId,
}: {
  nodes: FileLayoutNode[];
  edges: FileLayoutEdge[];
  selectedId: string | null;
}) {
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <group>
      {edges.map((e) => {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) return null;

        const isHighlighted = selectedId && (e.source === selectedId || e.target === selectedId);
        if (selectedId && !isHighlighted) return null; // hide unrelated edges when file selected

        return (
          <Line
            key={`i-${e.source}-${e.target}`}
            points={[
              [s.x, s.y, s.z],
              [t.x, t.y, t.z],
            ]}
            color={isHighlighted ? "#60a5fa" : "#334155"}
            lineWidth={isHighlighted ? 1.5 : 0.5}
            opacity={isHighlighted ? 0.7 : 0.12}
            transparent
          />
        );
      })}
    </group>
  );
}

function CochangeEdges({
  nodes,
  cochanges,
  selectedId,
}: {
  nodes: FileLayoutNode[];
  cochanges: GraphCochange[];
  selectedId: string | null;
}) {
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  if (!selectedId) return null; // only show cochange edges when a file is selected

  return (
    <group>
      {cochanges.map((c) => {
        if (c.source !== selectedId && c.target !== selectedId) return null;
        const s = nodeMap.get(c.source);
        const t = nodeMap.get(c.target);
        if (!s || !t) return null;

        return (
          <Line
            key={`c-${c.source}-${c.target}`}
            points={[
              [s.x, s.y, s.z],
              [t.x, t.y, t.z],
            ]}
            color="#f59e0b"
            lineWidth={Math.min(2, 0.5 + c.weight * 0.3)}
            opacity={0.5}
            transparent
            dashed
            dashSize={0.22}
            gapSize={0.08}
          />
        );
      })}
    </group>
  );
}

function SceneBackdrop() {
  const stars = useMemo(() => {
    const count = 900;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const radius = 10 + Math.random() * 24;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
    }

    return positions;
  }, []);

  return (
    <>
      <color attach="background" args={["#01040d"]} />
      <fog attach="fog" args={["#01040d", 22, 70]} />
      <ambientLight intensity={0.9} />
      <pointLight position={[8, 5, 6]} intensity={0.75} color="#7dd3fc" />
      <pointLight position={[-10, -6, -8]} intensity={0.35} color="#f59e0b" />

      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#cbd5e1"
          size={0.03}
          sizeAttenuation
          transparent
          opacity={0.42}
          depthWrite={false}
        />
      </points>
    </>
  );
}

// ── Info Panel ────────────────────────────────────────────────────────────────

function FileInfoPanel({ fileId, detail, onClose }: { fileId: string; detail: GraphDetail; onClose: () => void }) {
  const file = detail.files.find((f) => f.path === fileId);
  if (!file) return null;

  const color = languageColor(file.language);
  const importers = detail.edges.filter((e) => e.target === fileId).map((e) => e.source);
  const imports = detail.edges.filter((e) => e.source === fileId).map((e) => e.target);
  const cochanges = detail.cochanges
    .filter((c) => c.source === fileId || c.target === fileId)
    .map((c) => ({
      path: c.source === fileId ? c.target : c.source,
      weight: c.weight,
    }))
    .sort((a, b) => b.weight - a.weight);

  const shortPath = (p: string) => p.split("/").pop() ?? p;

  return (
    <div className="absolute bottom-3 left-3 z-10 w-96 rounded-lg border border-border bg-background/95 backdrop-blur-sm shadow-xl text-xs max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-mono font-semibold text-sm truncate">{shortPath(file.path)}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground ml-2 text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Full path */}
        <div className="text-muted-foreground font-mono text-[11px] break-all">{file.path}</div>

        {/* Badges row */}
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

        {/* Git activity */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-muted/50 px-2.5 py-1.5 text-center">
            <div className="text-foreground font-semibold text-sm">{file.commits}</div>
            <div className="text-muted-foreground text-[9px]">commits</div>
          </div>
          <div className="rounded-md bg-muted/50 px-2.5 py-1.5 text-center">
            <div className="text-foreground font-semibold text-sm">{file.recent90d}</div>
            <div className="text-muted-foreground text-[9px]">last 90d</div>
          </div>
          <div className="rounded-md bg-muted/50 px-2.5 py-1.5 text-center">
            <div className="text-foreground font-semibold text-sm">{importers.length + imports.length}</div>
            <div className="text-muted-foreground text-[9px]">connections</div>
          </div>
        </div>

        {/* Exports */}
        {file.exports.length > 0 && (
          <div>
            <div className="text-muted-foreground font-medium mb-1">Exports ({file.exports.length})</div>
            <div className="flex flex-wrap gap-1">
              {file.exports.slice(0, 12).map((e) => (
                <span key={e} className="font-mono text-[10px] bg-muted/60 px-1.5 py-0.5 rounded text-foreground/80">
                  {e}
                </span>
              ))}
              {file.exports.length > 12 && (
                <span className="text-[10px] text-muted-foreground">+{file.exports.length - 12}</span>
              )}
            </div>
          </div>
        )}

        {/* Symbols */}
        {file.symbols.length > 0 && (
          <div>
            <div className="text-muted-foreground font-medium mb-1">Symbols ({file.symbols.length})</div>
            <div className="space-y-1">
              {file.symbols.slice(0, 12).map((symbol) => (
                <div key={`${symbol.kind}:${symbol.name}:${symbol.line}`} className="flex items-center gap-1.5 text-[10px]">
                  <Badge variant="outline" className="h-4 px-1.5 font-mono text-[9px] lowercase">
                    {symbol.kind}
                  </Badge>
                  <span className="flex-1 truncate font-mono text-foreground/85">{symbol.name}</span>
                  <span className="shrink-0 font-mono text-muted-foreground">L{symbol.line}</span>
                  {symbol.exported && (
                    <Badge variant="secondary" className="h-4 px-1.5 font-mono text-[9px]">
                      export
                    </Badge>
                  )}
                </div>
              ))}
              {file.symbols.length > 12 && (
                <span className="text-[10px] text-muted-foreground">+{file.symbols.length - 12} more</span>
              )}
            </div>
          </div>
        )}

        {/* Imported by */}
        {importers.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium mb-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-400" />
              Imported by ({importers.length})
            </div>
            <div className="space-y-0.5">
              {importers.slice(0, 8).map((p) => (
                <div key={p} className="font-mono text-[10px] text-foreground/80 truncate pl-4">
                  {shortPath(p)}
                  <span className="text-muted-foreground/50 ml-1">{p.split("/").slice(0, -1).join("/")}</span>
                </div>
              ))}
              {importers.length > 8 && (
                <div className="text-[10px] text-muted-foreground pl-4">+{importers.length - 8} more</div>
              )}
            </div>
          </div>
        )}

        {/* Imports */}
        {imports.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium mb-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-400" />
              Imports ({imports.length})
            </div>
            <div className="space-y-0.5">
              {imports.slice(0, 8).map((p) => (
                <div key={p} className="font-mono text-[10px] text-foreground/80 truncate pl-4">
                  {shortPath(p)}
                  <span className="text-muted-foreground/50 ml-1">{p.split("/").slice(0, -1).join("/")}</span>
                </div>
              ))}
              {imports.length > 8 && (
                <div className="text-[10px] text-muted-foreground pl-4">+{imports.length - 8} more</div>
              )}
            </div>
          </div>
        )}

        {/* Co-changes */}
        {cochanges.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium mb-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
              Co-changed with ({cochanges.length})
            </div>
            <div className="space-y-0.5">
              {cochanges.slice(0, 8).map((c) => (
                <div
                  key={c.path}
                  className="font-mono text-[10px] text-foreground/80 truncate pl-4 flex items-center gap-1"
                >
                  <span className="truncate">{shortPath(c.path)}</span>
                  <span className="text-amber-400/70 shrink-0">×{c.weight}</span>
                  <span className="text-muted-foreground/50 truncate">{c.path.split("/").slice(0, -1).join("/")}</span>
                </div>
              ))}
              {cochanges.length > 8 && (
                <div className="text-[10px] text-muted-foreground pl-4">+{cochanges.length - 8} more</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-blue-400" />
          import
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-amber-400 border-dashed" />
          co-change
        </span>
      </div>
    </div>
  );
}

// ── File Tree ────────────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  isFile: boolean;
  language: string | null;
  isHub: boolean;
}

function buildTree(files: FileLayoutNode[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map(), isFile: false, language: null, isHub: false };
  for (const f of files) {
    const parts = f.id.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          children: new Map(),
          isFile: i === parts.length - 1,
          language: i === parts.length - 1 ? f.language : null,
          isHub: i === parts.length - 1 ? f.isHub : false,
        });
      }
      current = current.children.get(part)!;
    }
  }
  return root;
}

function TreeEntry({
  node,
  depth,
  selectedFile,
  onSelect,
  defaultOpen,
}: {
  node: TreeNode;
  depth: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isSelected = node.isFile && node.path === selectedFile;
  const children = Array.from(node.children.values()).sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  if (node.isFile) {
    const color = languageColor(node.language);
    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={`flex items-center gap-1.5 w-full text-left py-0.5 px-1 rounded text-[11px] font-mono truncate hover:bg-muted/50 ${
          isSelected ? "bg-muted text-foreground" : "text-muted-foreground"
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        <span className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">{node.name}</span>
        {node.isHub && <span className="text-[8px] text-amber-400 shrink-0">hub</span>}
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 w-full text-left py-0.5 px-1 rounded text-[11px] font-mono text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <Folder className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        <span className="truncate">{node.name}</span>
        <span className="text-[9px] text-muted-foreground/40 ml-auto shrink-0">{node.children.size}</span>
      </button>
      {open &&
        children.map((child) => (
          <TreeEntry
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            onSelect={onSelect}
            defaultOpen={depth < 1}
          />
        ))}
    </div>
  );
}

function FileTree({
  nodes,
  selectedFile,
  onSelect,
}: {
  nodes: FileLayoutNode[];
  selectedFile: string | null;
  onSelect: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const topChildren = Array.from(tree.children.values()).sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden py-1 scrollbar-thin">
      {topChildren.map((child) => (
        <TreeEntry
          key={child.path}
          node={child}
          depth={0}
          selectedFile={selectedFile}
          onSelect={onSelect}
          defaultOpen
        />
      ))}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function Explore() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeDirParam = searchParams.get("dir") ?? "";
  const activeDir = activeDirParam.trim();
  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);

  // Empty string means "all files detail". Non-empty uses backend dir filtering.
  const { data: detail, isLoading } = useGraphDetail(repo?.root_path, activeDir);

  const layout = useMemo<{ nodes: FileLayoutNode[]; edges: FileLayoutEdge[] } | null>(() => {
    if (!detail || detail.files.length === 0) return null;
    return layoutFiles(detail);
  }, [detail]);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);
  const [autoRotateDirection, setAutoRotateDirection] = useState(1);
  const orbitRef = useRef<any>(null);
  const draggingRef = useRef(false);
  const lastAzimuthRef = useRef<number | null>(null);
  const lastDragDeltaRef = useRef(0);

  // Cochanges with valid endpoints
  const validCochanges = useMemo(() => {
    if (!detail || !layout) return [];
    const nodeSet = new Set(layout.nodes.map((n) => n.id));
    return detail.cochanges.filter((c) => nodeSet.has(c.source) && nodeSet.has(c.target));
  }, [detail, layout]);

  const findNodePos = useCallback(
    (id: string): [number, number, number] | null => {
      if (!layout) return null;
      const node = layout.nodes.find((n) => n.id === id);
      if (!node) return null;
      return [node.x, node.y, node.z];
    },
    [layout],
  );

  // Connected node IDs (imports + cochanges) for dimming
  const connectedIds = useMemo(() => {
    if (!selectedFile || !detail) return null;
    const ids = new Set<string>([selectedFile]);
    for (const e of detail.edges) {
      if (e.source === selectedFile) ids.add(e.target);
      if (e.target === selectedFile) ids.add(e.source);
    }
    for (const c of detail.cochanges) {
      if (c.source === selectedFile) ids.add(c.target);
      if (c.target === selectedFile) ids.add(c.source);
    }
    return ids;
  }, [selectedFile, detail]);

  const sceneNodes = useMemo(() => {
    if (!layout) return [] as FileLayoutNode[];
    if (!selectedFile || !connectedIds) return layout.nodes;

    const selected = layout.nodes.find((n) => n.id === selectedFile);
    if (!selected) return layout.nodes;

    const connectedNodes = layout.nodes.filter((n) => n.id !== selectedFile && connectedIds.has(n.id));
    if (connectedNodes.length === 0) return layout.nodes;

    const spreadRadius = Math.min(4.8, Math.max(1.8, 1.2 + Math.sqrt(connectedNodes.length) * 0.42));
    const ordered = [...connectedNodes].sort((a, b) => {
      if (a.hubScore !== b.hubScore) return b.hubScore - a.hubScore;
      return a.id.localeCompare(b.id);
    });

    const repositioned = new Map<string, [number, number, number]>();
    for (let i = 0; i < ordered.length; i++) {
      const [ox, oy, oz] = spherePoint(i, ordered.length, spreadRadius);
      repositioned.set(ordered[i].id, [selected.x + ox, selected.y + oy, selected.z + oz]);
    }

    return layout.nodes.map((n) => {
      const p = repositioned.get(n.id);
      if (!p) return n;
      return { ...n, x: p[0], y: p[1], z: p[2] };
    });
  }, [layout, selectedFile, connectedIds]);

  const focusDistance = useMemo(() => {
    if (!selectedFile || !connectedIds) return 5;
    const count = Math.max(0, connectedIds.size - 1);
    return Math.min(10, Math.max(6, 4.6 + Math.sqrt(count) * 0.9));
  }, [selectedFile, connectedIds]);

  const selectedFileDir = useMemo(() => {
    if (!selectedFile) return "";
    const idx = selectedFile.lastIndexOf("/");
    return idx > 0 ? selectedFile.slice(0, idx) : "";
  }, [selectedFile]);

  const labelIds = useMemo(() => new Set(sceneNodes.map((n) => n.id)), [sceneNodes]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === "/" && !paletteOpen && document.activeElement === document.body) {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === "Escape") {
        setSelectedFile(null);
        setCameraTarget(null);
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paletteOpen]);

  const handleFileSelect = useCallback(
    (path: string) => {
      setSelectedFile(path);
      const pos = findNodePos(path);
      if (pos) setCameraTarget(pos);
    },
    [findNodePos],
  );

  const handleOrbitStart = useCallback(() => {
    draggingRef.current = true;
    lastDragDeltaRef.current = 0;
    lastAzimuthRef.current = orbitRef.current?.getAzimuthalAngle() ?? null;
  }, []);

  const handleOrbitChange = useCallback(() => {
    if (!draggingRef.current || !orbitRef.current) return;
    const current = orbitRef.current.getAzimuthalAngle();
    const prev = lastAzimuthRef.current;
    if (prev != null) {
      const delta = current - prev;
      if (Math.abs(delta) > 1e-4) {
        lastDragDeltaRef.current = delta;
      }
    }
    lastAzimuthRef.current = current;
  }, []);

  const handleOrbitEnd = useCallback(() => {
    draggingRef.current = false;
    lastAzimuthRef.current = null;
    const delta = lastDragDeltaRef.current;
    if (Math.abs(delta) > 1e-4) {
      // OrbitControls auto-rotate sign is opposite drag theta delta.
      setAutoRotateDirection(delta < 0 ? 1 : -1);
    }
  }, []);

  if (!repoId) return null;

  const showCanvas = !isLoading && layout && layout.nodes.length > 0;
  const hubCount = layout?.nodes.filter((n) => n.isHub).length ?? 0;
  const overviewDistance = useMemo(() => {
    if (!layout || layout.nodes.length === 0) return 8;
    const maxRadius = layout.nodes.reduce((max, n) => Math.max(max, Math.hypot(n.x, n.y, n.z)), 0);
    return Math.min(10, Math.max(5.2, maxRadius * 2.05));
  }, [layout]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <PageHeader>
        <button
          type="button"
          onClick={() => navigate(`/repos/${repoId}`)}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium truncate">{repo?.name ?? repoId}</span>
        {repo && <StatusBadge status={repo.index_status} className="ml-1" />}
        {activeDir && (
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("dir");
              setSearchParams(next, { replace: true });
            }}
            className="ml-2 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
            title="Clear directory filter"
          >
            dir: {activeDir} ×
          </button>
        )}
        {selectedFileDir && selectedFileDir !== activeDir && (
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set("dir", selectedFileDir);
              setSearchParams(next, { replace: true });
              setSelectedFile(null);
              setCameraTarget(null);
            }}
            className="ml-1 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
            title="Filter graph to selected file directory"
          >
            use dir: {selectedFileDir}
          </button>
        )}
        {layout && (
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
            {layout.nodes.length} files · {layout.edges.length} imports · {validCochanges.length} co-changes ·{" "}
            {hubCount} hubs
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">⌘K to search</span>
      </PageHeader>

      <div className="flex flex-1 min-h-0">
        {/* File tree sidebar */}
        {showCanvas && layout && (
          <div className="w-56 shrink-0 border-r border-border bg-background overflow-hidden flex flex-col">
            <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground border-b border-border uppercase tracking-wider">
              Files
            </div>
            <FileTree nodes={layout.nodes} selectedFile={selectedFile} onSelect={handleFileSelect} />
          </div>
        )}

        {/* 3D canvas */}
        <div className="relative flex-1 min-h-0 overflow-hidden bg-[#01040d]">
          <div className="pointer-events-none absolute inset-0 z-0 opacity-35 [background-image:radial-gradient(rgba(148,163,184,0.24)_0.6px,transparent_0.6px)] [background-size:3px_3px]" />
          <div className="pointer-events-none absolute inset-0 z-0 opacity-25 [background-image:repeating-linear-gradient(0deg,rgba(30,41,59,0.45)_0px,rgba(30,41,59,0.45)_1px,transparent_1px,transparent_5px)]" />
          {!showCanvas ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <Canvas
              className="relative z-[1]"
              camera={{ position: [0, 0, overviewDistance], fov: 55 }}
              gl={{ antialias: true, powerPreference: "high-performance" }}
              dpr={[1, 1.5]}
            >
              <SceneBackdrop />

              {sceneNodes.map((n) => (
                <FileNode
                  key={n.id}
                  node={n}
                  selected={n.id === selectedFile}
                  dimmed={!!connectedIds && !connectedIds.has(n.id)}
                  showLabel={labelIds.has(n.id)}
                  onSelect={handleFileSelect}
                />
              ))}
              <ImportEdges nodes={sceneNodes} edges={layout.edges} selectedId={selectedFile} />
              <CochangeEdges nodes={sceneNodes} cochanges={validCochanges} selectedId={selectedFile} />
              <CameraController target={cameraTarget} distance={focusDistance} homeDistance={overviewDistance} />
              <OrbitControls
                ref={orbitRef}
                makeDefault
                enableDamping
                dampingFactor={0.03}
                rotateSpeed={0.62}
                panSpeed={0.75}
                zoomSpeed={0.9}
                autoRotate
                autoRotateSpeed={0.1 * autoRotateDirection}
                onStart={handleOrbitStart}
                onChange={handleOrbitChange}
                onEnd={handleOrbitEnd}
                minDistance={2}
                maxDistance={overviewDistance * 2.5}
              />
            </Canvas>
          )}

          {/* Info panel */}
          {selectedFile && detail && (
            <FileInfoPanel
              fileId={selectedFile}
              detail={detail}
              onClose={() => {
                setSelectedFile(null);
                setCameraTarget(null);
              }}
            />
          )}

          {/* Command palette */}
          {repo && (
            <CommandPalette
              repoPath={repo.root_path}
              open={paletteOpen}
              onClose={() => setPaletteOpen(false)}
              onSelect={handleFileSelect}
            />
          )}
        </div>
      </div>
    </div>
  );
}
