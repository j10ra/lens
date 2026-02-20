import { PageHeader } from "@lens/ui";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { StatusBadge } from "../components/StatusBadge.js";
import { useGraphSummary } from "../queries/use-repo-graph.js";
import { useRepos } from "../queries/use-repos.js";

export function Explore() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);

  const { data: summary, isLoading } = useGraphSummary(repo?.root_path);

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
      </PageHeader>

      <div className="flex-1 min-h-0 bg-black">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <Canvas camera={{ position: [0, 0, 100], fov: 60 }}>
            <ambientLight intensity={0.3} />
            <pointLight position={[50, 50, 50]} intensity={1} />
            <OrbitControls enableDamping dampingFactor={0.05} />
          </Canvas>
        )}
      </div>
    </div>
  );
}
