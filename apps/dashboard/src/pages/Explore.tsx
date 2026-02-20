import { PageHeader } from "@lens/ui";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { CameraController } from "../components/explore/CameraController.js";
import { ClusterCloud } from "../components/explore/ClusterCloud.js";
import { CommandPalette } from "../components/explore/CommandPalette.js";
import { EdgeLines } from "../components/explore/EdgeLines.js";
import { StatusBadge } from "../components/StatusBadge.js";
import type { LayoutEdge, LayoutNode } from "../lib/graph-layout.js";
import { layoutClusters } from "../lib/graph-layout.js";
import { useGraphSummary } from "../queries/use-repo-graph.js";
import { useRepos } from "../queries/use-repos.js";

export function Explore() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);

  const { data: summary, isLoading } = useGraphSummary(repo?.root_path);

  const [layout, setLayout] = useState<{ nodes: LayoutNode[]; edges: LayoutEdge[] } | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [_selectedFile, setSelectedFile] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);

  // Compute layout when summary changes
  useEffect(() => {
    if (!summary) {
      setLayout(null);
      return;
    }
    layoutClusters(summary.clusters, summary.edges).then(setLayout);
  }, [summary]);

  // Find node position by id
  const findNodePos = useCallback(
    (id: string): [number, number, number] | null => {
      if (!layout) return null;
      const node = layout.nodes.find((n) => n.id === id);
      if (!node) return null;
      return [node.x, node.y, node.z];
    },
    [layout],
  );

  // Keyboard handlers
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
        setSelectedCluster(null);
        setSelectedFile(null);
        setCameraTarget(null);
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paletteOpen]);

  // Handle cluster selection
  const handleClusterSelect = useCallback(
    (clusterId: string) => {
      setSelectedCluster(clusterId);
      const pos = findNodePos(clusterId);
      if (pos) setCameraTarget(pos);
    },
    [findNodePos],
  );

  // Handle file selection from palette
  const handleFileSelect = useCallback(
    (path: string) => {
      setSelectedFile(path);
      const clusterKey = path.split("/").slice(0, 2).join("/");
      const pos = findNodePos(clusterKey);
      if (pos) setCameraTarget(pos);
    },
    [findNodePos],
  );

  if (!repoId) return null;

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
        {summary && (
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
            {summary.clusters.length} clusters · {summary.edges.length} edges
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">⌘K to search</span>
      </PageHeader>

      <div className="flex-1 min-h-0 bg-black relative">
        {isLoading || !layout ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <Canvas camera={{ position: [0, 0, 100], fov: 60 }}>
            <ambientLight intensity={0.3} />
            <pointLight position={[50, 50, 50]} intensity={1} />

            <ClusterCloud nodes={layout.nodes} onSelect={handleClusterSelect} selectedId={selectedCluster} />
            <EdgeLines nodes={layout.nodes} edges={layout.edges} dimmed={!!selectedCluster} />
            <CameraController target={cameraTarget} distance={40} />
            <OrbitControls enableDamping dampingFactor={0.05} />

            <EffectComposer>
              <Bloom luminanceThreshold={0.8} luminanceSmoothing={0.3} intensity={0.5} />
            </EffectComposer>
          </Canvas>
        )}

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
