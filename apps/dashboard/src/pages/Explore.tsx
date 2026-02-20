import { Badge, PageHeader } from "@lens/ui";
import { Billboard, Line, OrbitControls, Text } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
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

function FileNode({
  node,
  selected,
  dimmed,
  onSelect,
}: {
  node: FileLayoutNode;
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
}) {
  const color = languageColor(node.language);
  const fileName = node.id.split("/").pop() ?? node.id;

  return (
    <Billboard
      position={[node.x, node.y, node.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
    >
      {/* Language color dot */}
      <mesh position={[-0.08, 0, 0.01]}>
        <circleGeometry args={[0.06, 16]} />
        <meshBasicMaterial color={selected ? "#ffffff" : color} transparent opacity={dimmed ? 0.1 : 1} />
      </mesh>
      {/* Filename */}
      <Text
        position={[0.02, 0, 0]}
        fontSize={node.isHub ? 0.18 : 0.13}
        anchorX="left"
        anchorY="middle"
        color={dimmed ? "#334155" : selected ? "#ffffff" : node.isHub ? "#f1f5f9" : "#94a3b8"}
        outlineWidth={dimmed ? 0 : 0.008}
        outlineColor="#000000"
        fontWeight={node.isHub ? "bold" : "normal"}
      >
        {fileName}
      </Text>
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
            dashSize={0.3}
            gapSize={0.2}
          />
        );
      })}
    </group>
  );
}

// ── Info Panel ────────────────────────────────────────────────────────────────

function FileInfoPanel({ fileId, detail, onClose }: { fileId: string; detail: GraphDetail; onClose: () => void }) {
  const file = detail.files.find((f) => f.path === fileId);
  if (!file) return null;

  const importers = detail.edges.filter((e) => e.target === fileId).map((e) => e.source);
  const imports = detail.edges.filter((e) => e.source === fileId).map((e) => e.target);
  const cochanges = detail.cochanges
    .filter((c) => c.source === fileId || c.target === fileId)
    .map((c) => ({
      path: c.source === fileId ? c.target : c.source,
      weight: c.weight,
    }))
    .sort((a, b) => b.weight - a.weight);

  return (
    <div className="absolute bottom-3 left-3 z-10 w-72 rounded-lg border border-border bg-background/95 backdrop-blur-sm shadow-xl text-xs">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono font-medium truncate">{file.path.split("/").pop()}</span>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground ml-2">
          ×
        </button>
      </div>
      <div className="px-3 py-2 space-y-2">
        <div className="text-muted-foreground font-mono text-[10px] truncate">{file.path}</div>

        <div className="flex gap-2 flex-wrap">
          {file.language && (
            <Badge variant="secondary" className="text-[9px]">
              {file.language}
            </Badge>
          )}
          {file.isHub && (
            <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-400">
              hub
            </Badge>
          )}
          <Badge variant="outline" className="text-[9px]">
            score {file.hubScore.toFixed(2)}
          </Badge>
        </div>

        {file.exports.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-0.5">Exports ({file.exports.length})</div>
            <div className="font-mono text-[10px] text-foreground/80 max-h-12 overflow-auto">
              {file.exports.slice(0, 8).join(", ")}
              {file.exports.length > 8 && ` +${file.exports.length - 8}`}
            </div>
          </div>
        )}

        {importers.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-0.5">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />
              Imported by ({importers.length})
            </div>
            <div className="font-mono text-[10px] text-foreground/80 max-h-12 overflow-auto">
              {importers
                .slice(0, 5)
                .map((p) => p.split("/").pop())
                .join(", ")}
              {importers.length > 5 && ` +${importers.length - 5}`}
            </div>
          </div>
        )}

        {imports.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-0.5">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />
              Imports ({imports.length})
            </div>
            <div className="font-mono text-[10px] text-foreground/80 max-h-12 overflow-auto">
              {imports
                .slice(0, 5)
                .map((p) => p.split("/").pop())
                .join(", ")}
              {imports.length > 5 && ` +${imports.length - 5}`}
            </div>
          </div>
        )}

        {cochanges.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-0.5">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />
              Co-changed with ({cochanges.length})
            </div>
            <div className="font-mono text-[10px] text-foreground/80 max-h-12 overflow-auto">
              {cochanges
                .slice(0, 5)
                .map((c) => `${c.path.split("/").pop()} ×${c.weight}`)
                .join(", ")}
              {cochanges.length > 5 && ` +${cochanges.length - 5}`}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-3 border-t border-border px-3 py-1.5 text-[9px] text-muted-foreground">
        <span>
          <span className="inline-block w-2 h-0.5 bg-blue-400 mr-1" />
          import
        </span>
        <span>
          <span className="inline-block w-2 h-0.5 bg-amber-400 mr-1 border-dashed" />
          co-change
        </span>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function Explore() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);

  const { data: detail, isLoading } = useGraphDetail(repo?.root_path);

  const layout = useMemo<{ nodes: FileLayoutNode[]; edges: FileLayoutEdge[] } | null>(() => {
    if (!detail || detail.files.length === 0) return null;
    return layoutFiles(detail);
  }, [detail]);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);

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

  if (!repoId) return null;

  const showCanvas = !isLoading && layout && layout.nodes.length > 0;
  const hubCount = layout?.nodes.filter((n) => n.isHub).length ?? 0;

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
        {layout && (
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
            {layout.nodes.length} files · {layout.edges.length} imports · {validCochanges.length} co-changes ·{" "}
            {hubCount} hubs
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">⌘K to search</span>
      </PageHeader>

      <div className="flex-1 min-h-0 bg-black relative">
        {!showCanvas ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <Canvas
            camera={{ position: [0, 0, 45], fov: 60 }}
            gl={{ antialias: true, powerPreference: "high-performance" }}
            dpr={[1, 1.5]}
          >
            <ambientLight intensity={1} />

            {layout.nodes.map((n) => (
              <FileNode
                key={n.id}
                node={n}
                selected={n.id === selectedFile}
                dimmed={!!connectedIds && !connectedIds.has(n.id)}
                onSelect={handleFileSelect}
              />
            ))}
            <ImportEdges nodes={layout.nodes} edges={layout.edges} selectedId={selectedFile} />
            <CochangeEdges nodes={layout.nodes} cochanges={validCochanges} selectedId={selectedFile} />
            <CameraController target={cameraTarget} distance={15} />
            <OrbitControls makeDefault enableDamping dampingFactor={0.05} />
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
  );
}
