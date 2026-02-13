import {
  Badge,
  Button,
  PageHeader,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Switch,
} from "@lens/ui";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Blocks,
  BookText,
  Check,
  Database,
  Eye,
  EyeOff,
  FileCode,
  Files,
  Filter,
  FolderGit2,
  GitCommit,
  Hash,
  LayoutDashboard,
  Network,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

type FileRow = Awaited<ReturnType<typeof api.repoFiles>>["files"][number];
type ChunkRow = Awaited<ReturnType<typeof api.repoChunks>>["chunks"][number];
type FileDetail = Awaited<ReturnType<typeof api.repoFileDetail>>;

export function RepoDetail() {
  const { repoId } = useParams({ strict: false }) as { repoId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [filePage, setFilePage] = useState(0);
  const [fileSearch, setFileSearch] = useState("");
  const [chunkPage, setChunkPage] = useState(0);
  const [chunkPathFilter, setChunkPathFilter] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);

  const { data: repoData } = useQuery({
    queryKey: ["dashboard-repos"],
    queryFn: api.repos,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

  const { data: usage } = useQuery({
    queryKey: ["dashboard-usage"],
    queryFn: api.localUsage,
    refetchInterval: 30_000,
  });
  const isPro = (usage?.plan ?? "free") === "pro";

  const repo = repoData?.repos.find((r) => r.id === repoId);

  const { data: filesData } = useQuery({
    queryKey: ["repo-files", repoId, filePage, fileSearch],
    queryFn: () =>
      api.repoFiles(repoId, {
        limit: 100,
        offset: filePage * 100,
        search: fileSearch || undefined,
      }),
    enabled: activeTab === "files",
    placeholderData: keepPreviousData,
  });

  const { data: chunksData } = useQuery({
    queryKey: ["repo-chunks", repoId, chunkPage, chunkPathFilter],
    queryFn: () =>
      api.repoChunks(repoId, {
        limit: 100,
        offset: chunkPage * 100,
        path: chunkPathFilter,
      }),
    enabled: activeTab === "chunks",
    placeholderData: keepPreviousData,
  });

  const { data: fileDetail, isLoading: fileDetailLoading } = useQuery({
    queryKey: ["repo-file-detail", repoId, selectedFilePath],
    queryFn: () => api.repoFileDetail(repoId, selectedFilePath!),
    enabled: !!selectedFilePath,
  });

  const { data: chunkDetail } = useQuery({
    queryKey: ["repo-chunk-detail", repoId, selectedChunkId],
    queryFn: () => api.repoChunkDetail(repoId, selectedChunkId!),
    enabled: !!selectedChunkId,
  });

  const { data: vocabData } = useQuery({
    queryKey: ["repo-vocab", repoId],
    queryFn: () => api.repoVocabClusters(repoId),
    enabled: activeTab === "vocab",
  });

  const reindex = useMutation({
    mutationFn: api.reindex,
    onMutate: (id) => {
      queryClient.setQueryData(["dashboard-repos"], (old: Awaited<ReturnType<typeof api.repos>> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          repos: old.repos.map((r) => (r.id === id ? { ...r, index_status: "indexing" } : r)),
        };
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["dashboard-repos"] }),
  });

  const startWatch = useMutation({
    mutationFn: api.startWatcher,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-repos"] }),
  });

  const stopWatch = useMutation({
    mutationFn: api.stopWatcher,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-repos"] }),
  });

  const remove = useMutation({
    mutationFn: api.removeRepo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-repos"] });
      navigate({ to: "/repos" });
    },
  });

  if (!repo) {
    return (
      <PageHeader>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/repos" })} className="gap-1 -ml-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <span className="text-sm text-muted-foreground">Repo not found</span>
      </PageHeader>
    );
  }

  return (
    <>
      <PageHeader>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/repos" })} className="gap-1 -ml-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <span className="text-sm font-medium">{repo.name}</span>
        <div className="ml-auto flex gap-2">
          <ActionBtn
            onClick={() => reindex.mutate(repo.id)}
            icon={RefreshCw}
            label="Re-index"
            loading={reindex.isPending}
          />
          {repo.watcher.active ? (
            <ActionBtn onClick={() => stopWatch.mutate(repo.id)} icon={EyeOff} label="Stop watcher" />
          ) : (
            <ActionBtn onClick={() => startWatch.mutate(repo.id)} icon={Eye} label="Start watcher" />
          )}
          {confirmRemove ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => remove.mutate(repo.id)}
                disabled={remove.isPending}
              >
                {remove.isPending ? "Removing..." : "Confirm"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmRemove(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <ActionBtn onClick={() => setConfirmRemove(true)} icon={Trash2} label="Remove" />
          )}
        </div>
      </PageHeader>

      <div className="flex flex-1 min-h-0">
        {/* Section sidebar */}
        <div className="hidden w-48 shrink-0 flex-col border-r border-border bg-muted/30 md:flex">
          <div className="flex-1 overflow-y-auto py-1">
            {SECTIONS.map((s) => (
              <button
                type="button"
                key={s.value}
                onClick={() => setActiveTab(s.value)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors ${
                  activeTab === s.value
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                <s.icon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="truncate">{s.label}</span>
                {s.value === "files" && filesData && (
                  <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums opacity-60">
                    {filesData.total}
                  </span>
                )}
                {s.value === "chunks" && chunksData && (
                  <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums opacity-60">
                    {chunksData.total}
                  </span>
                )}
                {s.value === "vocab" && vocabData && (
                  <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums opacity-60">
                    {vocabData.clusters.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile section selector */}
        <select
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value)}
          className="h-8 w-full border-b border-border bg-background px-3 text-xs md:hidden"
        >
          {SECTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {/* Main content area */}
        <div className="flex min-w-0 min-h-0 flex-1 flex-col">
          {activeTab === "overview" && (
            <div className="flex-1 min-h-0 overflow-auto">
              <OverviewTab repo={repo} isPro={isPro} repoId={repoId} />
            </div>
          )}
          {activeTab === "files" && (
            <div className="flex min-w-0 min-h-0 flex-1 flex-col">
              <FilesTab
                files={filesData?.files ?? []}
                total={filesData?.total ?? 0}
                page={filePage}
                onPageChange={setFilePage}
                search={fileSearch}
                onSearchChange={(s) => {
                  setFileSearch(s);
                  setFilePage(0);
                }}
                isPro={isPro}
                onSelectFile={(path) => setSelectedFilePath(path)}
                onFilterChunks={(path) => {
                  setChunkPathFilter(path);
                  setChunkPage(0);
                  setActiveTab("chunks");
                }}
              />
            </div>
          )}
          {activeTab === "chunks" && (
            <div className="flex min-w-0 min-h-0 flex-1 flex-col">
              <ChunksTab
                chunks={chunksData?.chunks ?? []}
                total={chunksData?.total ?? 0}
                page={chunkPage}
                onPageChange={setChunkPage}
                pathFilter={chunkPathFilter}
                onClearFilter={() => {
                  setChunkPathFilter(undefined);
                  setChunkPage(0);
                }}
                onSelectChunk={(id) => setSelectedChunkId(id)}
              />
            </div>
          )}
          {activeTab === "vocab" && (
            <div className="flex-1 min-h-0 overflow-auto">
              <VocabTab clusters={vocabData?.clusters ?? []} />
            </div>
          )}
        </div>
      </div>

      {/* File Detail Sheet */}
      <Sheet open={!!selectedFilePath} onOpenChange={(open) => !open && setSelectedFilePath(null)}>
        <SheetContent side="right" className="overflow-y-auto sm:max-w-xl">
          {fileDetail ? (
            <FileDetailSheet
              detail={fileDetail}
              onViewChunks={() => {
                setSelectedFilePath(null);
                setChunkPathFilter(fileDetail.path);
                setChunkPage(0);
                setActiveTab("chunks");
              }}
              onNavigateFile={(path) => setSelectedFilePath(path)}
            />
          ) : fileDetailLoading && selectedFilePath ? (
            <Spinner />
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Chunk Detail Sheet */}
      <Sheet open={!!selectedChunkId} onOpenChange={(open) => !open && setSelectedChunkId(null)}>
        <SheetContent side="right" className="overflow-y-auto sm:max-w-2xl">
          {chunkDetail ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-sm break-all select-all pr-6">
                  <FileCode className="inline h-3.5 w-3.5 mr-1.5 align-text-bottom" />
                  {chunkDetail.path}
                </SheetTitle>
                <SheetDescription>
                  Chunk #{chunkDetail.chunk_index}
                  {" · "}L{chunkDetail.start_line}–{chunkDetail.end_line}
                  {" · "}
                  {chunkDetail.language ?? "unknown"}
                  {chunkDetail.has_embedding && " · embedded"}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4 px-4 pb-4">
                <Separator />
                <section>
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground">Content</h4>
                  <div className="max-h-[70vh] overflow-auto rounded-md border bg-muted/30 p-3">
                    <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                      {chunkDetail.content}
                    </pre>
                  </div>
                </section>
                <Separator />
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Hash</span>
                    <p className="font-mono text-[10px] mt-0.5 break-all">{chunkDetail.chunk_hash}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Embedding</span>
                    <p className="mt-0.5">{chunkDetail.has_embedding ? "Yes" : "No"}</p>
                  </div>
                </div>
              </div>
            </>
          ) : selectedChunkId ? (
            <Spinner />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

const SECTIONS = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "files", label: "Files", icon: Files },
  { value: "chunks", label: "Chunks", icon: Blocks },
  { value: "vocab", label: "Vocab Clusters", icon: BookText },
] as const;

// --- File Detail Sheet ---

function FileDetailSheet({
  detail,
  onViewChunks,
  onNavigateFile,
}: {
  detail: FileDetail;
  onViewChunks: () => void;
  onNavigateFile: (path: string) => void;
}) {
  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-mono text-sm break-all select-all pr-6">{detail.path}</SheetTitle>
        <SheetDescription>
          {detail.language ?? "unknown"}
          {" · "}
          {detail.chunk_count} chunks
          {detail.embedded_count > 0 && ` · ${detail.embedded_count} embedded`}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4 pb-4">
        {/* Purpose */}
        {detail.purpose && (
          <>
            <Separator />
            <DetailSection title="Purpose">
              <p className="text-sm">{detail.purpose}</p>
            </DetailSection>
          </>
        )}

        {/* Docstring */}
        {detail.docstring && (
          <>
            <Separator />
            <DetailSection title="Docstring">
              <p className="text-xs text-muted-foreground italic">{detail.docstring}</p>
            </DetailSection>
          </>
        )}

        {/* Exports */}
        {detail.exports.length > 0 && (
          <>
            <Separator />
            <DetailSection title={`Exports (${detail.exports.length})`}>
              <div className="flex flex-wrap gap-1">
                {detail.exports.map((exp) => (
                  <Badge key={exp} variant="secondary" className="font-mono text-[10px]">
                    {exp}
                  </Badge>
                ))}
              </div>
            </DetailSection>
          </>
        )}

        {/* Sections */}
        {detail.sections.length > 0 && (
          <>
            <Separator />
            <DetailSection title={`Sections (${detail.sections.length})`}>
              <div className="flex flex-wrap gap-1">
                {detail.sections.map((s) => (
                  <Badge key={s} variant="outline" className="text-[10px]">
                    {s}
                  </Badge>
                ))}
              </div>
            </DetailSection>
          </>
        )}

        {/* Internals */}
        {detail.internals.length > 0 && (
          <>
            <Separator />
            <DetailSection title={`Internal identifiers (${detail.internals.length})`}>
              <div className="flex flex-wrap gap-1">
                {detail.internals.map((i) => (
                  <Badge key={i} variant="secondary" className="font-mono text-[10px] bg-muted/50">
                    {i}
                  </Badge>
                ))}
              </div>
            </DetailSection>
          </>
        )}

        {/* Imports (this file imports) */}
        {detail.imports.length > 0 && (
          <>
            <Separator />
            <DetailSection title={`Imports (${detail.imports.length})`} icon={<ArrowUpRight className="h-3 w-3" />}>
              <div className="space-y-0.5">
                {detail.imports.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onNavigateFile(p)}
                    className="block text-xs font-mono text-primary hover:underline truncate max-w-full"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </DetailSection>
          </>
        )}

        {/* Imported by */}
        {detail.imported_by.length > 0 && (
          <>
            <Separator />
            <DetailSection
              title={`Imported by (${detail.imported_by.length})`}
              icon={<ArrowDownLeft className="h-3 w-3" />}
            >
              <div className="space-y-0.5">
                {detail.imported_by.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onNavigateFile(p)}
                    className="block text-xs font-mono text-primary hover:underline truncate max-w-full"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </DetailSection>
          </>
        )}

        {/* Git stats */}
        {detail.git && (
          <>
            <Separator />
            <DetailSection title="Git activity" icon={<GitCommit className="h-3 w-3" />}>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Commits</span>
                  <p className="font-mono font-medium tabular-nums">{detail.git.commit_count}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Recent (90d)</span>
                  <p className="font-mono font-medium tabular-nums">{detail.git.recent_count}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Last modified</span>
                  <p className="font-mono tabular-nums">
                    {detail.git.last_modified ? timeAgo(detail.git.last_modified) : "—"}
                  </p>
                </div>
              </div>
            </DetailSection>
          </>
        )}

        {/* Co-changes */}
        {detail.cochanges.length > 0 && (
          <>
            <Separator />
            <DetailSection title={`Co-changes (${detail.cochanges.length})`} icon={<Hash className="h-3 w-3" />}>
              <div className="space-y-1">
                {detail.cochanges.map((co) => (
                  <div key={co.path} className="flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onNavigateFile(co.path)}
                      className="font-mono text-primary hover:underline truncate text-left min-w-0"
                    >
                      {co.path}
                    </button>
                    <span className="font-mono tabular-nums text-muted-foreground shrink-0">{co.count}x</span>
                  </div>
                ))}
              </div>
            </DetailSection>
          </>
        )}

        <Separator />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onViewChunks}>
            <Filter className="h-3 w-3" />
            View chunks
          </Button>
        </div>
      </div>
    </>
  );
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}

// --- Overview Tab ---

type RepoSummary = NonNullable<Awaited<ReturnType<typeof api.repos>>["repos"]>[number];

function OverviewTab({ repo, isPro, repoId }: { repo: RepoSummary; isPro: boolean; repoId: string }) {
  const queryClient = useQueryClient();
  const updateSettings = useMutation({
    mutationFn: (settings: {
      enable_embeddings?: boolean;
      enable_summaries?: boolean;
      enable_vocab_clusters?: boolean;
    }) => api.updateRepoSettings(repoId, settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-repos"] }),
  });
  const embPct = repo.embeddable_count > 0 ? Math.round((repo.embedded_count / repo.embeddable_count) * 100) : 0;
  const purPct = repo.purpose_total > 0 ? Math.round((repo.purpose_count / repo.purpose_total) * 100) : 0;

  return (
    <div className="space-y-2 p-2">
      <p className="text-xs text-muted-foreground">Overview</p>
      <div className="grid gap-2 @xl/main:grid-cols-2 @3xl/main:grid-cols-3">
        {/* Index */}
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Index</span>
            <StatusBadge status={repo.index_status} />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <Kv label="Files" value={repo.files_indexed} />
            <Kv label="Chunks" value={repo.chunk_count.toLocaleString()} />
            <Kv label="Import depth" value={repo.max_import_depth} />
            <Kv label="Indexed" value={timeAgo(repo.last_indexed_at)} />
            <Kv label="Commit" value={repo.last_indexed_commit?.slice(0, 8) ?? "\u2014"} mono />
          </div>
        </div>

        {/* Enrichment */}
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Enrichment</span>
            {!isPro && (
              <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/40">
                Pro
              </Badge>
            )}
          </div>
          <div className="space-y-2 text-xs">
            <div className={`flex items-center gap-2 ${!isPro || !repo.enable_embeddings ? "opacity-50" : ""}`}>
              <Switch
                checked={!!repo.enable_embeddings}
                onCheckedChange={(v) => updateSettings.mutate({ enable_embeddings: v })}
                disabled={!isPro}
                className="scale-75 origin-left shrink-0"
              />
              <div className="flex-1 min-w-0">
                <MiniProgress
                  label="Embeddings"
                  value={repo.embedded_count}
                  max={repo.embeddable_count}
                  pct={embPct}
                  disabled={!isPro || !repo.enable_embeddings}
                />
              </div>
            </div>
            <div className={`flex items-center gap-2 ${!isPro || !repo.enable_summaries ? "opacity-50" : ""}`}>
              <Switch
                checked={!!repo.enable_summaries}
                onCheckedChange={(v) => updateSettings.mutate({ enable_summaries: v })}
                disabled={!isPro}
                className="scale-75 origin-left shrink-0"
              />
              <div className="flex-1 min-w-0">
                <MiniProgress
                  label="Summaries"
                  value={repo.purpose_count}
                  max={repo.purpose_total}
                  pct={purPct}
                  disabled={!isPro || !repo.enable_summaries}
                />
              </div>
            </div>
            <div className={`flex items-center gap-2 ${!isPro || !repo.enable_vocab_clusters ? "opacity-50" : ""}`}>
              <Switch
                checked={!!repo.enable_vocab_clusters}
                onCheckedChange={(v) => updateSettings.mutate({ enable_vocab_clusters: v })}
                disabled={!isPro}
                className="scale-75 origin-left shrink-0"
              />
              <div className="flex items-baseline justify-between flex-1">
                <span className="text-[10px] text-muted-foreground">Vocab clusters</span>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {repo.vocab_cluster_count}
                </span>
              </div>
            </div>
            {!isPro && (
              <Link
                to="/billing"
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-3 py-1.5 text-[11px] font-medium text-amber-500 hover:bg-amber-500/10 mt-1"
              >
                <Sparkles className="h-3 w-3" />
                Upgrade to Pro
              </Link>
            )}
          </div>
        </div>

        {/* Watcher */}
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Watcher</span>
            <StatusBadge status={repo.watcher.active ? "active" : "inactive"} />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {repo.watcher.active ? (
              <>
                <Kv label="Changed files" value={repo.watcher.changed_files} />
                <Kv label="Started" value={timeAgo(repo.watcher.started_at)} />
              </>
            ) : (
              <p className="text-[10px] text-muted-foreground col-span-2">
                Not watching. Use the sidebar button to start.
              </p>
            )}
          </div>
        </div>

        {/* Repository */}
        <div className="rounded-lg border bg-card p-3 @xl/main:col-span-2 @3xl/main:col-span-3">
          <div className="flex items-center gap-2 mb-2">
            <FolderGit2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Repository</span>
          </div>
          <p className="font-mono text-xs break-all text-muted-foreground">{repo.root_path}</p>
        </div>
      </div>
    </div>
  );
}

function Kv({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-xs font-medium tabular-nums ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function MiniProgress({
  label,
  value,
  max,
  pct,
  disabled,
}: {
  label: string;
  value: number;
  max: number;
  pct: number;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-50" : ""}>
      <div className="flex items-baseline justify-between mb-0.5">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {value}/{max}
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// --- Files Tab ---

function FilesTab({
  files,
  total,
  page,
  onPageChange,
  search,
  onSearchChange,
  isPro,
  onSelectFile,
  onFilterChunks,
}: {
  files: FileRow[];
  total: number;
  page: number;
  onPageChange: (p: number) => void;
  search: string;
  onSearchChange: (s: string) => void;
  isPro: boolean;
  onSelectFile: (path: string) => void;
  onFilterChunks: (path: string) => void;
}) {
  const pageSize = 100;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter files..."
            className="h-7 w-52 rounded-md border border-border bg-background pl-7 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">{total} files</span>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/60 text-left">
              <th className="w-12 border-b border-r border-border bg-muted/60 px-2 py-2 text-center font-medium text-muted-foreground">
                #
              </th>
              <th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">
                Path
              </th>
              <th className="w-16 border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">
                Lang
              </th>
              <th className="w-16 border-b border-r border-border bg-muted/60 px-3 py-2 text-right font-medium text-muted-foreground">
                Exports
              </th>
              <th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground max-w-[200px]">
                Purpose
              </th>
              <th className="w-16 border-b border-r border-border bg-muted/60 px-3 py-2 text-right font-medium text-muted-foreground">
                Chunks
              </th>
              <th className="w-14 border-b border-border bg-muted/60 px-3 py-2 text-center font-medium text-muted-foreground">
                Embed
              </th>
            </tr>
          </thead>
          <tbody>
            {files.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted-foreground">
                  {search ? "No matching files" : "No files indexed yet"}
                </td>
              </tr>
            ) : (
              files.map((f, i) => (
                <tr key={f.path} className="group hover:bg-accent/30">
                  <td className="border-b border-r border-border bg-muted/20 px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground tabular-nums">
                    {page * pageSize + i + 1}
                  </td>
                  <td className="border-b border-r border-border px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectFile(f.path)}
                      className="text-primary hover:underline font-mono text-left"
                    >
                      {f.path}
                    </button>
                  </td>
                  <td className="border-b border-r border-border px-3 py-1.5 font-mono">{f.language ?? "—"}</td>
                  <td className="border-b border-r border-border px-3 py-1.5 text-right font-mono tabular-nums">
                    {f.exports.length}
                  </td>
                  <td className="border-b border-r border-border px-3 py-1.5 max-w-[200px]">
                    {f.purpose ? (
                      <span className="truncate block max-w-[200px]" title={f.purpose}>
                        {f.purpose}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="border-b border-r border-border px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFilterChunks(f.path);
                      }}
                      className="font-mono tabular-nums text-primary hover:underline"
                    >
                      {f.chunk_count}
                    </button>
                  </td>
                  <td className="border-b border-border px-3 py-1.5 text-center">
                    {isPro ? (
                      f.has_embedding ? (
                        <Check className="h-3.5 w-3.5 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {total > pageSize && (
        <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
            >
              Prev
            </Button>
            <span className="px-1.5 tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// --- Chunks Tab ---

function ChunksTab({
  chunks,
  total,
  page,
  onPageChange,
  pathFilter,
  onClearFilter,
  onSelectChunk,
}: {
  chunks: ChunkRow[];
  total: number;
  page: number;
  onPageChange: (p: number) => void;
  pathFilter?: string;
  onClearFilter: () => void;
  onSelectChunk: (id: string) => void;
}) {
  const pageSize = 100;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {total} chunks{pathFilter ? ` in ${pathFilter}` : ""}
        </span>
        {pathFilter && (
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="font-mono text-[10px]">
              {pathFilter}
            </Badge>
            <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={onClearFilter}>
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/60 text-left">
              <th className="w-12 border-b border-r border-border bg-muted/60 px-2 py-2 text-center font-medium text-muted-foreground">
                #
              </th>
              <th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">
                Path
              </th>
              <th className="w-14 border-b border-r border-border bg-muted/60 px-3 py-2 text-right font-medium text-muted-foreground">
                Idx
              </th>
              <th className="w-24 border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">
                Lines
              </th>
              <th className="w-16 border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">
                Lang
              </th>
              <th className="w-14 border-b border-border bg-muted/60 px-3 py-2 text-center font-medium text-muted-foreground">
                Embed
              </th>
            </tr>
          </thead>
          <tbody>
            {chunks.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground">
                  No chunks found
                </td>
              </tr>
            ) : (
              chunks.map((ch, i) => (
                <tr key={ch.id} className="group hover:bg-accent/30">
                  <td className="border-b border-r border-border bg-muted/20 px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground tabular-nums">
                    {page * pageSize + i + 1}
                  </td>
                  <td className="border-b border-r border-border px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectChunk(ch.id)}
                      className="text-primary hover:underline font-mono text-left"
                    >
                      {ch.path}
                    </button>
                  </td>
                  <td className="border-b border-r border-border px-3 py-1.5 text-right font-mono tabular-nums">
                    {ch.chunk_index}
                  </td>
                  <td className="border-b border-r border-border px-3 py-1.5 font-mono tabular-nums">
                    {ch.start_line}–{ch.end_line}
                  </td>
                  <td className="border-b border-r border-border px-3 py-1.5 font-mono">{ch.language ?? "—"}</td>
                  <td className="border-b border-border px-3 py-1.5 text-center">
                    {ch.has_embedding ? (
                      <Check className="h-3.5 w-3.5 text-green-500 mx-auto" />
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {total > pageSize && (
        <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
            >
              Prev
            </Button>
            <span className="px-1.5 tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// --- Vocab Tab ---

function VocabTab({ clusters }: { clusters: Array<{ terms: string[]; centroid_term?: string }> }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (clusters.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-10 m-2 text-center text-sm text-muted-foreground">
        No vocab clusters. Pro plan required for semantic term clustering.
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2">
      <p className="text-xs text-muted-foreground">{clusters.length} clusters</p>
      <div className="grid gap-2 @xl/main:grid-cols-2 @3xl/main:grid-cols-3">
        {clusters.map((cluster, i) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: clusters have no stable id
            key={i}
            type="button"
            onClick={() => setExpanded(expanded === i ? null : i)}
            className="rounded-lg border bg-card p-3 text-left hover:bg-accent/30 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <Network className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Cluster {i + 1}</span>
              <span className="text-[10px] text-muted-foreground">{cluster.terms.length} terms</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {(expanded === i ? cluster.terms : cluster.terms.slice(0, 8)).map((term) => (
                <Badge key={term} variant="secondary" className="text-[10px] font-mono">
                  {term}
                </Badge>
              ))}
              {expanded !== i && cluster.terms.length > 8 && (
                <span className="text-[10px] text-muted-foreground self-center">+{cluster.terms.length - 8}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Shared ---

function ActionBtn({
  onClick,
  icon: Icon,
  label,
  loading,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  loading?: boolean;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading} className="gap-1.5">
      <Icon className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
      {label}
    </Button>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
