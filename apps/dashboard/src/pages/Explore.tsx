import { Badge, cn, FileTypeFilter, type FileTypeFilterOption } from "@lens/ui";
import { Line, OrbitControls, PointMaterial } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Globe, Layers } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router";
import { CameraController } from "../components/explore/CameraController.js";
import { CommandPalette } from "../components/explore/CommandPalette.js";
import { FileCloud } from "../components/explore/FileCloud.js";
import { LODLabels } from "../components/explore/LODLabels.js";
import { api } from "../lib/api.js";
import type { FileLayoutEdge, FileLayoutNode } from "../lib/graph-layout.js";
import { layoutFiles } from "../lib/graph-layout.js";
import type { FileNeighborhood, GraphCochange, GraphOverview } from "../lib/graph-types.js";
import { languageColor } from "../lib/language-colors.js";
import { useGraphNeighbors, useGraphOverview } from "../queries/use-repo-graph.js";
import { useRepos } from "../queries/use-repos.js";
import { DagView } from "./Navigator.js";

// ── 3D Components ────────────────────────────────────────────────────────────

function spherePoint(index: number, total: number, radius: number): [number, number, number] {
  if (total <= 1) return [radius, 0, 0];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / (total - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y)) * radius;
  const theta = golden * index;
  return [Math.cos(theta) * r, y * radius, Math.sin(theta) * r];
}

interface ExploreSceneTheme {
  shellBgClass: string;
  dotsTextureClass: string;
  linesTextureClass: string;
  backdropColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambientIntensity: number;
  keyLightColor: string;
  keyLightIntensity: number;
  fillLightColor: string;
  fillLightIntensity: number;
  starColor: string;
  starOpacity: number;
  labelDim: string;
  labelSelected: string;
  labelHot: string;
  labelMid: string;
  labelCold: string;
  labelOutline: string;
  importEdge: string;
  exportEdge: string;
  importEdgeMuted: string;
  cochangeEdge: string;
}

const DARK_SCENE_THEME: ExploreSceneTheme = {
  shellBgClass: "bg-background",
  dotsTextureClass:
    "text-muted-foreground opacity-22 [background-image:radial-gradient(circle,currentColor_1px,transparent_1.25px)] [background-size:14px_14px]",
  linesTextureClass:
    "text-border opacity-14 [background-image:radial-gradient(circle_at_50%_0%,currentColor,transparent_64%)]",
  backdropColor: "#141922",
  fogColor: "#141922",
  fogNear: 54,
  fogFar: 190,
  ambientIntensity: 0.9,
  keyLightColor: "#7dd3fc",
  keyLightIntensity: 0.75,
  fillLightColor: "#f59e0b",
  fillLightIntensity: 0.35,
  starColor: "#cbd5e1",
  starOpacity: 0.42,
  labelDim: "#64748b",
  labelSelected: "#ffffff",
  labelHot: "#f8fafc",
  labelMid: "#cbd5e1",
  labelCold: "#94a3b8",
  labelOutline: "#020617",
  importEdge: "#22c55e",
  exportEdge: "#3b82f6",
  importEdgeMuted: "#334155",
  cochangeEdge: "#f59e0b",
};

const LIGHT_SCENE_THEME: ExploreSceneTheme = {
  shellBgClass: "bg-background",
  dotsTextureClass:
    "text-muted-foreground opacity-18 [background-image:radial-gradient(circle,currentColor_1px,transparent_1.25px)] [background-size:14px_14px]",
  linesTextureClass:
    "text-border opacity-10 [background-image:radial-gradient(circle_at_50%_0%,currentColor,transparent_66%)]",
  backdropColor: "#eef1f6",
  fogColor: "#dfe4ec",
  fogNear: 44,
  fogFar: 160,
  ambientIntensity: 1,
  keyLightColor: "#2563eb",
  keyLightIntensity: 0.55,
  fillLightColor: "#d97706",
  fillLightIntensity: 0.2,
  starColor: "#334155",
  starOpacity: 0.2,
  labelDim: "#94a3b8",
  labelSelected: "#0f172a",
  labelHot: "#0f172a",
  labelMid: "#1e293b",
  labelCold: "#334155",
  labelOutline: "#ffffff",
  importEdge: "#16a34a",
  exportEdge: "#2563eb",
  importEdgeMuted: "#94a3b8",
  cochangeEdge: "#d97706",
};

function getIsDarkTheme(): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.classList.contains("dark");
}

function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState<boolean>(getIsDarkTheme);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setIsDark(getIsDarkTheme());
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    window.addEventListener("storage", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", update);
    };
  }, []);

  return isDark;
}

function ImportEdges({
  nodes,
  edges,
  selectedId,
  sceneTheme,
}: {
  nodes: FileLayoutNode[];
  edges: FileLayoutEdge[];
  selectedId: string | null;
  sceneTheme: ExploreSceneTheme;
}) {
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <group>
      {edges.map((e) => {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) return null;

        const isHighlighted = selectedId && (e.source === selectedId || e.target === selectedId);
        if (selectedId && !isHighlighted) return null;
        const edgeColor =
          selectedId == null
            ? sceneTheme.importEdgeMuted
            : e.target === selectedId
              ? sceneTheme.importEdge
              : sceneTheme.exportEdge;

        return (
          <Line
            key={`i-${e.source}-${e.target}`}
            points={[
              [s.x, s.y, s.z],
              [t.x, t.y, t.z],
            ]}
            color={edgeColor}
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
  sceneTheme,
}: {
  nodes: FileLayoutNode[];
  cochanges: GraphCochange[];
  selectedId: string | null;
  sceneTheme: ExploreSceneTheme;
}) {
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  if (!selectedId) return null;

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
            color={sceneTheme.cochangeEdge}
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

function SceneBackdrop({ sceneTheme }: { sceneTheme: ExploreSceneTheme }) {
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
      <fog attach="fog" args={[sceneTheme.fogColor, sceneTheme.fogNear, sceneTheme.fogFar]} />
      <ambientLight intensity={sceneTheme.ambientIntensity} />
      <pointLight position={[8, 5, 6]} intensity={sceneTheme.keyLightIntensity} color={sceneTheme.keyLightColor} />
      <pointLight
        position={[-10, -6, -8]}
        intensity={sceneTheme.fillLightIntensity}
        color={sceneTheme.fillLightColor}
      />

      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars, 3]} />
        </bufferGeometry>
        <PointMaterial
          color={sceneTheme.starColor}
          size={0.03}
          sizeAttenuation
          transparent
          opacity={sceneTheme.starOpacity}
          depthWrite={false}
        />
      </points>
    </>
  );
}

// ── Info Panel ────────────────────────────────────────────────────────────────

function FileInfoPanel({
  repoId,
  neighbors,
  neighborsLoading,
  onClose,
  onNavigate,
}: {
  repoId: string;
  neighbors: FileNeighborhood | undefined;
  neighborsLoading: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const shortPath = (p: string) => p.split("/").pop() ?? p;
  const openInEditor = async (path: string, line?: number) => {
    try {
      await api.openFile(repoId, path, line);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to open editor: ${message}`);
    }
  };

  if (neighborsLoading) {
    return (
      <div className="absolute left-auto right-3 top-3 bottom-3 z-10 w-96 rounded-lg border border-border bg-background/95 backdrop-blur-sm shadow-xl text-xs overflow-y-auto flex items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!neighbors) return null;
  const file = neighbors.file;
  const color = languageColor(file.language);

  return (
    <div className="absolute left-auto right-3 top-3 bottom-3 z-10 w-96 rounded-lg border border-border bg-background/95 backdrop-blur-sm shadow-xl text-xs overflow-y-auto">
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
        <button
          type="button"
          onClick={() => void openInEditor(file.path)}
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <ExternalLink className="h-3 w-3" />
          Open in editor
        </button>

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
            <div className="text-foreground font-semibold text-sm">
              {neighbors.imports.length + neighbors.importers.length}
            </div>
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
                <button
                  key={`${symbol.kind}:${symbol.name}:${symbol.line}`}
                  type="button"
                  onClick={() => void openInEditor(file.path, symbol.line)}
                  className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-[10px] hover:bg-muted/50"
                >
                  <Badge variant="outline" className="h-4 px-1.5 font-mono text-[9px] lowercase">
                    {symbol.kind}
                  </Badge>
                  <span className="flex-1 truncate font-mono text-foreground/85">{symbol.name}</span>
                  <span className="shrink-0 font-mono text-muted-foreground">L{symbol.line}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/80" />
                  {symbol.exported && (
                    <Badge variant="secondary" className="h-4 px-1.5 font-mono text-[9px]">
                      export
                    </Badge>
                  )}
                </button>
              ))}
              {file.symbols.length > 12 && (
                <span className="text-[10px] text-muted-foreground">+{file.symbols.length - 12} more</span>
              )}
            </div>
          </div>
        )}

        {/* Imported by */}
        {neighbors.importers.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium mb-1">
              <ArrowDownLeft className="h-3 w-3 text-green-500" />
              Imported by ({neighbors.importers.length})
            </div>
            <div className="space-y-0.5">
              {neighbors.importers.slice(0, 8).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onNavigate(p)}
                  className="flex w-full items-center gap-1 truncate pl-4 text-left font-mono text-[10px] text-foreground/80 hover:text-primary"
                >
                  <span className="truncate">{shortPath(p)}</span>
                  <span className="truncate text-muted-foreground/50">{p.split("/").slice(0, -1).join("/")}</span>
                </button>
              ))}
              {neighbors.importers.length > 8 && (
                <div className="text-[10px] text-muted-foreground pl-4">+{neighbors.importers.length - 8} more</div>
              )}
            </div>
          </div>
        )}

        {/* Imports */}
        {neighbors.imports.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium mb-1">
              <ArrowUpRight className="h-3 w-3 text-blue-500" />
              Imports ({neighbors.imports.length})
            </div>
            <div className="space-y-0.5">
              {neighbors.imports.slice(0, 8).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onNavigate(p)}
                  className="flex w-full items-center gap-1 truncate pl-4 text-left font-mono text-[10px] text-foreground/80 hover:text-primary"
                >
                  <span className="truncate">{shortPath(p)}</span>
                  <span className="truncate text-muted-foreground/50">{p.split("/").slice(0, -1).join("/")}</span>
                </button>
              ))}
              {neighbors.imports.length > 8 && (
                <div className="text-[10px] text-muted-foreground pl-4">+{neighbors.imports.length - 8} more</div>
              )}
            </div>
          </div>
        )}

        {/* Co-changes */}
        {neighbors.cochanges.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium mb-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
              Co-changed with ({neighbors.cochanges.length})
            </div>
            <div className="space-y-0.5">
              {neighbors.cochanges.slice(0, 8).map((c) => (
                <button
                  key={c.path}
                  type="button"
                  onClick={() => onNavigate(c.path)}
                  className="flex w-full items-center gap-1 truncate pl-4 text-left font-mono text-[10px] text-foreground/80 hover:text-primary"
                >
                  <span className="truncate">{shortPath(c.path)}</span>
                  <span className="text-amber-400/70 shrink-0">×{c.weight}</span>
                  <span className="truncate text-muted-foreground/50">{c.path.split("/").slice(0, -1).join("/")}</span>
                </button>
              ))}
              {neighbors.cochanges.length > 8 && (
                <div className="text-[10px] text-muted-foreground pl-4">+{neighbors.cochanges.length - 8} more</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-green-500" />
          import
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-blue-500" />
          export
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-amber-400 border-dashed" />
          co-change
        </span>
      </div>
    </div>
  );
}

// ── File Type Filters ────────────────────────────────────────────────────────

const FILE_EXTENSION_REGEX = /(\.[a-z0-9_-]+)$/i;
const DOTFILE_REGEX = /^\.[a-z0-9_-]+$/i;

function fileTypeFromPath(path: string): string {
  const fileName = path.split("/").pop() ?? path;
  const extension = fileName.match(FILE_EXTENSION_REGEX)?.[1];
  if (extension) return extension.toLowerCase();
  if (DOTFILE_REGEX.test(fileName)) return fileName.toLowerCase();
  return "(no ext)";
}

function buildFileTypeOptions(files: GraphOverview["files"]): FileTypeFilterOption[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const type = fileTypeFromPath(file.path);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([type, count]) => ({
      value: type,
      label: type,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function areSetsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

// ── View Toggle ─────────────────────────────────────────────────────────────

type ViewMode = "galaxy" | "dag";

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="absolute bottom-3 left-3 z-10 flex rounded-md border border-border bg-background/90 backdrop-blur-sm shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => onChange("galaxy")}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium transition-colors",
          mode === "galaxy"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        )}
      >
        <Globe className="h-3.5 w-3.5" />
        Galaxy
      </button>
      <button
        type="button"
        onClick={() => onChange("dag")}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium transition-colors border-l border-border",
          mode === "dag"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        )}
      >
        <Layers className="h-3.5 w-3.5" />
        DAG
      </button>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function RepoGraphTab({ repoId }: { repoId: string }) {
  const isDarkTheme = useIsDarkTheme();
  const sceneTheme = isDarkTheme ? DARK_SCENE_THEME : LIGHT_SCENE_THEME;
  const [searchParams] = useSearchParams();
  const activeDirParam = searchParams.get("dir") ?? "";
  const activeDir = activeDirParam.trim();
  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);

  // View mode toggle
  const [viewMode, setViewMode] = useState<ViewMode>("galaxy");

  // Overview data (lightweight — no symbols/exports)
  const { data: overview, isLoading } = useGraphOverview(repo?.root_path, activeDir);

  // Neighbors data (on-demand — full detail for selected file)
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const { data: neighbors, isLoading: neighborsLoading } = useGraphNeighbors(repo?.root_path, selectedFile);

  const fileTypeOptions = useMemo<FileTypeFilterOption[]>(() => {
    if (!overview) return [];
    return buildFileTypeOptions(overview.files);
  }, [overview]);
  const allFileTypeValues = useMemo(() => fileTypeOptions.map((option) => option.value), [fileTypeOptions]);

  const [selectedFileTypes, setSelectedFileTypes] = useState<Set<string> | null>(null);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);
  const [autoRotateDirection, setAutoRotateDirection] = useState(1);
  const orbitRef = useRef<any>(null);
  const draggingRef = useRef(false);
  const lastAzimuthRef = useRef<number | null>(null);
  const lastPolarRef = useRef<number | null>(null);
  const lastDragDeltaRef = useRef(0);
  const sceneNodeClickRef = useRef(false);
  const hadOrbitInteractionRef = useRef(false);
  const suppressCanvasClickRef = useRef(false);

  useEffect(() => {
    const availableTypes = new Set(allFileTypeValues);
    setSelectedFileTypes((prev) => {
      if (availableTypes.size === 0) return prev;
      if (prev == null) return availableTypes;

      const next = new Set<string>();
      for (const type of prev) {
        if (availableTypes.has(type)) next.add(type);
      }
      if (next.size === 0 && prev.size > 0) return availableTypes;
      return areSetsEqual(prev, next) ? prev : next;
    });
  }, [allFileTypeValues]);

  const selectedFileTypeSet = useMemo(
    () => selectedFileTypes ?? new Set(allFileTypeValues),
    [selectedFileTypes, allFileTypeValues],
  );

  const toggleFileType = useCallback(
    (type: string) => {
      setSelectedFileTypes((prev) => {
        const next = new Set(prev ?? allFileTypeValues);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        return next;
      });
    },
    [allFileTypeValues],
  );

  const toggleAllFileTypes = useCallback(() => {
    setSelectedFileTypes((prev) => {
      const base = prev ?? new Set(allFileTypeValues);
      if (base.size === allFileTypeValues.length) return new Set<string>();
      return new Set(allFileTypeValues);
    });
  }, [allFileTypeValues]);

  // Filter overview data by selected file types
  const filteredOverview = useMemo<GraphOverview | null>(() => {
    if (!overview) return null;
    if (selectedFileTypeSet.size === 0) {
      return { files: [], edges: [], cochanges: [], totalFiles: overview.totalFiles };
    }

    const files = overview.files.filter((file) => selectedFileTypeSet.has(fileTypeFromPath(file.path)));
    const visiblePathSet = new Set(files.map((file) => file.path));
    const edges = overview.edges.filter((edge) => visiblePathSet.has(edge.source) && visiblePathSet.has(edge.target));
    const cochanges = overview.cochanges.filter(
      (cochange) => visiblePathSet.has(cochange.source) && visiblePathSet.has(cochange.target),
    );

    return { files, edges, cochanges, totalFiles: overview.totalFiles };
  }, [overview, selectedFileTypeSet]);

  const selectedFileCount = filteredOverview?.files.length ?? 0;

  const layout = useMemo<{
    nodes: FileLayoutNode[];
    edges: FileLayoutEdge[];
  } | null>(() => {
    if (!filteredOverview || filteredOverview.files.length === 0) return null;
    return layoutFiles(filteredOverview);
  }, [filteredOverview]);

  // Filtered cochanges with valid endpoints — merge overview + neighbors data
  const validCochanges = useMemo(() => {
    if (!layout) return [];
    const nodeSet = new Set(layout.nodes.map((n) => n.id));

    // Start with overview cochanges
    const overviewCochanges = filteredOverview
      ? filteredOverview.cochanges.filter((c) => nodeSet.has(c.source) && nodeSet.has(c.target))
      : [];

    // When neighbors loaded, supplement with neighbor cochanges (for edges the overview may have pruned)
    if (!selectedFile || !neighbors) return overviewCochanges;

    const existing = new Set(overviewCochanges.map((c) => `${c.source}\0${c.target}`));
    const extra = neighbors.cochanges
      .filter(
        (c) =>
          nodeSet.has(c.path) &&
          !existing.has(`${selectedFile}\0${c.path}`) &&
          !existing.has(`${c.path}\0${selectedFile}`),
      )
      .map((c) => ({ source: selectedFile, target: c.path, weight: c.weight }));

    return [...overviewCochanges, ...extra];
  }, [filteredOverview, layout, selectedFile, neighbors]);

  const findNodePos = useCallback(
    (id: string): [number, number, number] | null => {
      if (!layout) return null;
      const node = layout.nodes.find((n) => n.id === id);
      if (!node) return null;
      return [node.x, node.y, node.z];
    },
    [layout],
  );

  // Connected node IDs from neighbors data (when available) or overview edges
  const connectedIds = useMemo(() => {
    if (!selectedFile) return null;
    const ids = new Set<string>([selectedFile]);

    if (neighbors) {
      for (const p of neighbors.imports) ids.add(p);
      for (const p of neighbors.importers) ids.add(p);
      for (const c of neighbors.cochanges) ids.add(c.path);
    } else if (filteredOverview) {
      for (const e of filteredOverview.edges) {
        if (e.source === selectedFile) ids.add(e.target);
        if (e.target === selectedFile) ids.add(e.source);
      }
      for (const c of filteredOverview.cochanges) {
        if (c.source === selectedFile) ids.add(c.target);
        if (c.target === selectedFile) ids.add(c.source);
      }
    }
    return ids;
  }, [selectedFile, neighbors, filteredOverview]);

  const importIds = useMemo(() => {
    if (!selectedFile) return null;
    const ids = new Set<string>();
    if (neighbors) {
      for (const p of neighbors.imports) ids.add(p);
      for (const p of neighbors.importers) ids.add(p);
    } else if (filteredOverview) {
      for (const e of filteredOverview.edges) {
        if (e.source === selectedFile) ids.add(e.target);
        if (e.target === selectedFile) ids.add(e.source);
      }
    }
    return ids;
  }, [selectedFile, neighbors, filteredOverview]);

  const cochangeIds = useMemo(() => {
    if (!selectedFile) return null;
    const ids = new Set<string>();
    if (neighbors) {
      for (const c of neighbors.cochanges) ids.add(c.path);
    } else {
      for (const c of validCochanges) {
        if (c.source === selectedFile) ids.add(c.target);
        if (c.target === selectedFile) ids.add(c.source);
      }
    }
    return ids;
  }, [selectedFile, neighbors, validCochanges]);

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

  const clearFocus = useCallback(() => {
    setSelectedFile(null);
    setCameraTarget(null);
  }, []);

  useEffect(() => {
    if (!selectedFile) return;
    const selectedFileVisible = filteredOverview?.files.some((file) => file.path === selectedFile) ?? false;
    if (!selectedFileVisible) {
      // File not in overview — keep selected for neighbors panel but don't try to find its position
    }
  }, [selectedFile, filteredOverview]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearFocus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clearFocus]);

  const handleFileSelect = useCallback(
    (path: string) => {
      setSelectedFile(path);
      if (viewMode === "galaxy") {
        const pos = findNodePos(path);
        if (pos) setCameraTarget(pos);
      }
    },
    [findNodePos, viewMode],
  );

  const handleSceneNodeSelect = useCallback(
    (path: string) => {
      sceneNodeClickRef.current = true;
      handleFileSelect(path);
    },
    [handleFileSelect],
  );

  const handleOrbitStart = useCallback(() => {
    draggingRef.current = true;
    lastDragDeltaRef.current = 0;
    hadOrbitInteractionRef.current = false;
    lastAzimuthRef.current = orbitRef.current?.getAzimuthalAngle() ?? null;
    lastPolarRef.current = orbitRef.current?.getPolarAngle() ?? null;
  }, []);

  const handleOrbitChange = useCallback(() => {
    if (!draggingRef.current || !orbitRef.current) return;
    const currentAzimuth = orbitRef.current.getAzimuthalAngle();
    const currentPolar = orbitRef.current.getPolarAngle();
    const prevAzimuth = lastAzimuthRef.current;
    const prevPolar = lastPolarRef.current;
    if (prevAzimuth != null && prevPolar != null) {
      const azimuthDelta = currentAzimuth - prevAzimuth;
      const polarDelta = currentPolar - prevPolar;
      const moved = Math.abs(azimuthDelta) > 2e-3 || Math.abs(polarDelta) > 2e-3;
      if (moved) {
        hadOrbitInteractionRef.current = true;
        if (Math.abs(azimuthDelta) > 1e-4) {
          lastDragDeltaRef.current = azimuthDelta;
        }
      }
    }
    lastAzimuthRef.current = currentAzimuth;
    lastPolarRef.current = currentPolar;
  }, []);

  const handleOrbitEnd = useCallback(() => {
    draggingRef.current = false;
    lastAzimuthRef.current = null;
    lastPolarRef.current = null;
    if (hadOrbitInteractionRef.current) {
      suppressCanvasClickRef.current = true;
      hadOrbitInteractionRef.current = false;
    }
    const delta = lastDragDeltaRef.current;
    if (Math.abs(delta) > 1e-4) {
      setAutoRotateDirection(delta < 0 ? 1 : -1);
    }
  }, []);

  const overviewDistance = useMemo(() => {
    if (!layout || layout.nodes.length === 0) return 8;
    const maxRadius = layout.nodes.reduce((max, n) => Math.max(max, Math.hypot(n.x, n.y, n.z)), 0);
    return Math.min(10, Math.max(5.2, maxRadius * 2.05));
  }, [layout]);

  if (!repoId) return null;

  const showFileTypeFilter = !isLoading && !!overview;
  const showCanvas = !isLoading && !!layout && layout.nodes.length > 0;
  const hasFilteredFiles = !isLoading && !!filteredOverview && filteredOverview.files.length > 0;
  const focusPanelCompensationPx = selectedFile ? 200 : 0;

  return (
    <div className="flex flex-1 min-h-0">
      {showFileTypeFilter && (
        <div className="w-56 shrink-0 border-r border-border bg-background overflow-hidden flex flex-col">
          <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground border-b border-border uppercase tracking-wider">
            Filters
          </div>
          <FileTypeFilter
            options={fileTypeOptions}
            selected={selectedFileTypeSet}
            onToggleOption={toggleFileType}
            onToggleAll={toggleAllFileTypes}
            className="min-h-0 flex-1"
          />
          <div className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border">
            <div>
              {selectedFileCount.toLocaleString()} files
              {overview && overview.totalFiles > overview.files.length && (
                <span className="text-muted-foreground/60"> of {overview.totalFiles.toLocaleString()} total</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={cn("relative flex-1 min-h-0 overflow-hidden", sceneTheme.shellBgClass)}>
        <div className={cn("pointer-events-none absolute inset-0 z-0", sceneTheme.dotsTextureClass)} />
        <div className={cn("pointer-events-none absolute inset-0 z-0", sceneTheme.linesTextureClass)} />
        {isLoading ? (
          <div className="relative z-[3] flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : viewMode === "galaxy" ? (
          !showCanvas ? (
            <div className="relative z-[3] flex h-full items-center justify-center px-8 text-center">
              <div className="text-xs text-muted-foreground">No files match the selected file types.</div>
            </div>
          ) : (
            <Canvas
              className="relative z-[1]"
              camera={{ position: [0, 0, overviewDistance], fov: 55 }}
              gl={{
                antialias: true,
                powerPreference: "high-performance",
                alpha: true,
              }}
              dpr={[1, 1.5]}
              onClick={() => {
                if (sceneNodeClickRef.current) {
                  sceneNodeClickRef.current = false;
                  suppressCanvasClickRef.current = false;
                  return;
                }
                if (suppressCanvasClickRef.current) {
                  suppressCanvasClickRef.current = false;
                  return;
                }
                if (selectedFile) clearFocus();
              }}
            >
              <SceneBackdrop sceneTheme={sceneTheme} />

              <FileCloud
                nodes={sceneNodes}
                selectedId={selectedFile}
                connectedIds={connectedIds}
                importIds={importIds}
                cochangeIds={cochangeIds}
                cochangeEdgeColor={sceneTheme.cochangeEdge}
                onSelect={handleSceneNodeSelect}
              />
              <LODLabels
                nodes={sceneNodes}
                selectedId={selectedFile}
                connectedIds={connectedIds}
                sceneTheme={sceneTheme}
              />
              <ImportEdges nodes={sceneNodes} edges={layout.edges} selectedId={selectedFile} sceneTheme={sceneTheme} />
              <CochangeEdges
                nodes={sceneNodes}
                cochanges={validCochanges}
                selectedId={selectedFile}
                sceneTheme={sceneTheme}
              />
              <CameraController
                target={cameraTarget}
                distance={focusDistance}
                homeDistance={overviewDistance}
                targetScreenOffsetPx={focusPanelCompensationPx}
              />
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
          )
        ) : hasFilteredFiles && filteredOverview ? (
          <DagView
            overview={filteredOverview}
            selectedFile={selectedFile}
            neighbors={neighbors}
            neighborsLoading={neighborsLoading}
            onSelectFile={handleFileSelect}
            onClearSelection={clearFocus}
          />
        ) : (
          <div className="relative z-[3] flex h-full items-center justify-center px-8 text-center">
            <div className="text-xs text-muted-foreground">No files match the selected file types.</div>
          </div>
        )}

        {selectedFile && (
          <FileInfoPanel
            repoId={repoId}
            neighbors={neighbors}
            neighborsLoading={neighborsLoading}
            onNavigate={handleFileSelect}
            onClose={() => {
              clearFocus();
            }}
          />
        )}

        {repo && (
          <CommandPalette
            repoPath={repo.root_path}
            open
            mode="pinned"
            onSelect={handleFileSelect}
            onClear={clearFocus}
          />
        )}

        {/* View mode toggle */}
        {!isLoading && <ViewToggle mode={viewMode} onChange={setViewMode} />}
      </div>
    </div>
  );
}

export function Explore() {
  const { repoId } = useParams<{ repoId: string }>();
  const [searchParams] = useSearchParams();
  if (!repoId) return null;
  const next = new URLSearchParams(searchParams);
  next.set("tab", "graph");
  return <Navigate to={`/repos/${repoId}?${next.toString()}`} replace />;
}
