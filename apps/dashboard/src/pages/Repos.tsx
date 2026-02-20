import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@lens/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileCode, FolderPlus, GitCommit, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { StatusBadge } from "../components/StatusBadge.js";
import { api } from "../lib/api.js";
import { type Repo, useRepos } from "../queries/use-repos.js";

function timeAgo(ts: string | null): string {
  if (!ts) return "never";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function RepoCard({ repo }: { repo: Repo }) {
  const qc = useQueryClient();
  const reindex = useMutation({
    mutationFn: () => api.reindex(repo.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repos"] }),
  });

  return (
    <Card className="border-border bg-background py-4 shadow-none">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="truncate text-sm">
                <Link to={`/repos/${repo.id}`} className="text-primary hover:underline">
                  {repo.name}
                </Link>
              </CardTitle>
              <StatusBadge status={repo.index_status} />
            </div>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{repo.root_path}</p>
          </div>
          <button
            type="button"
            onClick={() => reindex.mutate()}
            disabled={reindex.isPending || repo.index_status === "indexing"}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            title="Re-index"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${reindex.isPending ? "animate-spin" : ""}`} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="font-mono text-xs font-semibold tabular-nums">
              <FileCode className="mr-0.5 inline h-3 w-3 text-muted-foreground" />
              {repo.file_count.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">Files</p>
          </div>
          <div>
            <p className="font-mono text-xs font-semibold tabular-nums">
              {repo.last_indexed_commit ? (
                <>
                  <GitCommit className="mr-0.5 inline h-3 w-3 text-muted-foreground" />
                  {repo.last_indexed_commit.slice(0, 7)}
                </>
              ) : (
                "—"
              )}
            </p>
            <p className="text-[10px] text-muted-foreground">Commit</p>
          </div>
          <div>
            <p className="font-mono text-xs font-semibold tabular-nums">{timeAgo(repo.last_indexed_at)}</p>
            <p className="text-[10px] text-muted-foreground">Indexed</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function Repos() {
  const { data: repos } = useRepos();
  const qc = useQueryClient();
  const [showRegister, setShowRegister] = useState(false);
  const [repoPath, setRepoPath] = useState("");

  const register = useMutation({
    mutationFn: (path: string) => api.registerRepo(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repos"] });
      setShowRegister(false);
      setRepoPath("");
    },
  });

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath.trim()) return;
    register.mutate(repoPath.trim());
  };

  return (
    <>
      <PageHeader>
        {showRegister ? (
          <form onSubmit={handleRegister} className="flex flex-1 items-center gap-2">
            <FolderPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="text"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="/absolute/path/to/repo"
              className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={register.isPending || !repoPath.trim()}
              className="h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {register.isPending ? "Registering..." : "Register"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowRegister(false);
                setRepoPath("");
              }}
              className="h-7 rounded-md border border-border px-3 text-xs hover:bg-accent"
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <span className="text-sm font-medium">Repositories</span>
            {repos && repos.length > 0 && (
              <Badge variant="outline" className="ml-1 font-mono text-[10px]">
                {repos.length}
              </Badge>
            )}
            <div className="ml-auto">
              <button
                type="button"
                onClick={() => setShowRegister(true)}
                className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" />
                Register
              </button>
            </div>
          </>
        )}
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto py-4 md:gap-6 md:py-6">
        {repos && repos.length > 0 ? (
          <div className="grid gap-3 px-4 lg:px-6 @xl/main:grid-cols-2">
            {repos.map((repo) => (
              <RepoCard key={repo.id} repo={repo} />
            ))}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">No repos registered.</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground/70">Run: `lens register &lt;path&gt;`</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
