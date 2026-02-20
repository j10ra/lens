import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@lens/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Code,
  FileCode,
  Files,
  FolderGit2,
  GitCommit,
  Hash,
  LayoutDashboard,
  Search,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { StatusBadge } from "../components/StatusBadge.js";
import { api } from "../lib/api.js";
import { useRepoFileDetail, useRepoFiles } from "../queries/use-repo-files.js";
import { useRepoStats, useRepos } from "../queries/use-repos.js";

const FILE_LIMIT = 100;

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

type Section = "overview" | "files";

const SECTIONS: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "files", label: "Files", icon: Files },
];

interface FilesTabProps {
  repoId: string;
  onSelectFile: (path: string) => void;
}

function FilesTab({ repoId, onSelectFile }: FilesTabProps) {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useRepoFiles(repoId, {
    limit: FILE_LIMIT,
    offset,
    search: search || undefined,
  });

  const files = data?.files ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / FILE_LIMIT);
  const currentPage = Math.floor(offset / FILE_LIMIT) + 1;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            placeholder="Filter files..."
            className="h-6 w-52 bg-transparent text-xs focus:outline-none"
          />
        </div>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
          {total.toLocaleString()} files
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60">
              <tr>
                <th className="w-12 border-b border-r border-border px-3 py-1.5 text-center font-mono text-[10px] text-muted-foreground">
                  #
                </th>
                <th className="border-b border-r border-border px-3 py-1.5 text-left font-medium">Path</th>
                <th className="w-16 border-b border-r border-border px-3 py-1.5 text-left font-medium">Lang</th>
                <th className="w-16 border-b border-border px-3 py-1.5 text-right font-medium">Exports</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file, i) => (
                <tr key={file.path} className="hover:bg-accent/30">
                  <td className="border-b border-r border-border bg-muted/20 px-3 py-1.5 text-center font-mono text-[10px] tabular-nums text-muted-foreground">
                    {offset + i + 1}
                  </td>
                  <td className="border-b border-r border-border px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectFile(file.path)}
                      className="font-mono text-primary hover:underline text-left break-all"
                    >
                      {file.path}
                    </button>
                  </td>
                  <td className="border-b border-r border-border px-3 py-1.5 text-muted-foreground">
                    {file.language ?? "—"}
                  </td>
                  <td className="border-b border-border px-3 py-1.5 text-right tabular-nums">
                    {file.exports?.length ?? 0}
                  </td>
                </tr>
              ))}
              {files.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    No files found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > FILE_LIMIT && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <span className="font-mono text-[10px] text-muted-foreground">
            {offset + 1}–{Math.min(offset + FILE_LIMIT, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - FILE_LIMIT))}
              disabled={offset === 0}
              className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-accent disabled:opacity-40"
            >
              Prev
            </button>
            <span className="mx-1 font-mono text-[10px] text-muted-foreground">
              {currentPage}/{pages}
            </span>
            <button
              type="button"
              onClick={() => setOffset(offset + FILE_LIMIT)}
              disabled={offset + FILE_LIMIT >= total}
              className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-accent disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface FileDetailSheetProps {
  repoId: string;
  filePath: string | null;
  onClose: () => void;
  onNavigate: (path: string) => void;
}

function FileDetailSheet({ repoId, filePath, onClose, onNavigate }: FileDetailSheetProps) {
  const { data: detail } = useRepoFileDetail(repoId, filePath);

  return (
    <Sheet open={!!filePath} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="overflow-y-auto sm:max-w-xl">
        {detail ? (
          <>
            <SheetHeader>
              <SheetTitle className="break-all select-all font-mono text-sm">{detail.path}</SheetTitle>
              <SheetDescription>{detail.language ?? "unknown"}</SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              {/* Exports */}
              {detail.exports && detail.exports.length > 0 && (
                <section>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Exports
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {detail.exports.map((e: string) => (
                      <Badge key={e} variant="secondary" className="font-mono text-[10px]">
                        {e}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              {/* Sections */}
              {detail.sections && detail.sections.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Sections
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {detail.sections.map((s: string) => (
                        <Badge key={s} variant="outline" className="font-mono text-[10px]">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {/* Internals */}
              {detail.internals && detail.internals.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Internals
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {detail.internals.map((s: string) => (
                        <Badge key={s} variant="secondary" className="bg-muted/50 font-mono text-[10px]">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {/* Imports (resolved edges) */}
              {detail.import_edges && detail.import_edges.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <ArrowUpRight className="h-3 w-3" />
                      Imports
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {detail.import_edges.map((imp: string) => (
                        <button
                          key={imp}
                          type="button"
                          onClick={() => onNavigate(imp)}
                          className="break-all text-left font-mono text-[11px] text-primary hover:underline"
                        >
                          {imp}
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {/* Imported By */}
              {detail.imported_by && detail.imported_by.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <ArrowDownLeft className="h-3 w-3" />
                      Imported by
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {detail.imported_by.map((imp: string) => (
                        <button
                          key={imp}
                          type="button"
                          onClick={() => onNavigate(imp)}
                          className="break-all text-left font-mono text-[11px] text-primary hover:underline"
                        >
                          {imp}
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {/* Git Activity */}
              {detail.git_stats && (
                <>
                  <Separator />
                  <section>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <GitCommit className="h-3 w-3" />
                      Git activity
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="font-mono text-xs font-semibold tabular-nums">{detail.git_stats.commits}</p>
                        <p className="text-[10px] text-muted-foreground">Commits</p>
                      </div>
                      <div>
                        <p className="font-mono text-xs font-semibold tabular-nums">{detail.git_stats.recent_90d}</p>
                        <p className="text-[10px] text-muted-foreground">Recent (90d)</p>
                      </div>
                      <div>
                        <p className="font-mono text-xs font-semibold tabular-nums">
                          {timeAgo(detail.git_stats.last_modified)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Last modified</p>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {/* Co-changes */}
              {detail.cochanges && detail.cochanges.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Hash className="h-3 w-3" />
                      Co-changes
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {detail.cochanges.map(({ path, count }: { path: string; count: number }) => (
                        <div key={path} className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onNavigate(path)}
                            className="flex-1 break-all text-left font-mono text-[11px] text-primary hover:underline"
                          >
                            {path}
                          </button>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{count}x</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function OverviewTab({ repoId }: { repoId: string }) {
  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);
  const { data: stats } = useRepoStats(repoId);
  const { data: files } = useRepoFiles(repoId, { limit: 1 });

  const languages = stats?.languages ?? [];
  const topLangs = languages.slice(0, 6);

  return (
    <div className="flex-1 overflow-auto py-4">
      <div className="grid gap-3 px-4 @xl/main:grid-cols-2 @3xl/main:grid-cols-3">
        {/* Index card */}
        <Card className="border-border bg-background py-4 shadow-none">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <FileCode className="h-4 w-4 text-muted-foreground" />
                Index
              </CardTitle>
              {repo && <StatusBadge status={repo.index_status} />}
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Files</span>
              <span className="font-mono tabular-nums">{files?.total?.toLocaleString() ?? "—"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Import edges</span>
              <span className="font-mono tabular-nums">{stats?.import_edges?.toLocaleString() ?? "—"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Last indexed</span>
              <span className="font-mono tabular-nums">{timeAgo(repo?.last_indexed_at ?? null)}</span>
            </div>
            {repo?.last_indexed_commit && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Commit</span>
                <span className="font-mono tabular-nums">{repo.last_indexed_commit.slice(0, 7)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Repository card */}
        <Card className="border-border bg-background py-4 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <FolderGit2 className="h-4 w-4 text-muted-foreground" />
              Repository
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Path</span>
              <span className="max-w-[60%] truncate font-mono text-[11px]" title={repo?.root_path}>
                {repo?.root_path ?? "—"}
              </span>
            </div>
            {repo?.remote_url && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Remote</span>
                <span className="max-w-[60%] truncate font-mono text-[11px]" title={repo.remote_url}>
                  {repo.remote_url}
                </span>
              </div>
            )}
            {repo?.created_at && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Registered</span>
                <span className="font-mono tabular-nums">{timeAgo(repo.created_at)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Languages card */}
        {topLangs.length > 0 && (
          <Card className="border-border bg-background py-4 shadow-none">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  <Code className="h-4 w-4 text-muted-foreground" />
                  Languages
                </CardTitle>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {languages.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {topLangs.map((lang) => {
                const pct = files?.total ? Math.round((lang.count / files.total) * 100) : 0;
                return (
                  <div key={lang.language} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{lang.language}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-12 text-right font-mono tabular-nums">{lang.count.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
              {languages.length > 6 && (
                <p className="text-[10px] text-muted-foreground">+{languages.length - 6} more</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export function RepoDetail() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);

  const [activeTab, setActiveTab] = useState<Section>("overview");
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  const { data: files } = useRepoFiles(repoId ?? "", { limit: 1 });

  const reindex = useMutation({
    mutationFn: () => api.reindex(repoId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repos"] }),
  });

  const remove = useMutation({
    mutationFn: () => api.removeRepo(repoId!),
    onSuccess: () => navigate("/repos"),
  });

  const handleRemove = () => {
    if (window.confirm(`Remove repo "${repo?.name}"? This cannot be undone.`)) {
      remove.mutate();
    }
  };

  if (!repoId) return null;

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* PageHeader */}
      <PageHeader>
        <button
          type="button"
          onClick={() => navigate("/repos")}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium truncate">{repo?.name ?? repoId}</span>
        {repo && <StatusBadge status={repo.index_status} className="ml-1" />}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => reindex.mutate()}
            disabled={reindex.isPending || repo?.index_status === "indexing"}
            className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-accent disabled:opacity-50"
          >
            Re-index
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={remove.isPending}
            className="flex h-7 items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      </PageHeader>

      {/* Two-panel body */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar — desktop */}
        <aside className="hidden w-48 shrink-0 flex-col border-r border-border bg-muted/30 md:flex">
          <nav className="flex flex-col py-2">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-xs ${
                  activeTab === id
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
                {id === "files" && files?.total != null && (
                  <span className="ml-auto font-mono text-[10px] tabular-nums opacity-60">
                    {files.total.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {/* Mobile section select */}
        <div className="border-b border-border px-4 py-2 md:hidden w-full">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as Section)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            {SECTIONS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Right content */}
        <div className="flex min-w-0 min-h-0 flex-1 flex-col">
          {activeTab === "overview" && <OverviewTab repoId={repoId} />}
          {activeTab === "files" && <FilesTab repoId={repoId} onSelectFile={setSelectedFilePath} />}
        </div>
      </div>

      {/* File detail Sheet */}
      <FileDetailSheet
        repoId={repoId}
        filePath={selectedFilePath}
        onClose={() => setSelectedFilePath(null)}
        onNavigate={(path) => setSelectedFilePath(path)}
      />
    </div>
  );
}
