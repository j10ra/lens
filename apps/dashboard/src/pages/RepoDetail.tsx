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
  ExternalLink,
  FileCode,
  Files,
  FolderGit2,
  GitCommit,
  Globe,
  Hash,
  Layers,
  LayoutDashboard,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { StatusBadge } from "../components/StatusBadge.js";
import { api } from "../lib/api.js";
import { useRepoFileDetail, useRepoFiles } from "../queries/use-repo-files.js";
import { useRepoStats, useRepos } from "../queries/use-repos.js";
import { RepoGraphTab } from "./Explore.js";
import { NavigatorTab } from "./Navigator.js";

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

type Section = "overview" | "files" | "grep" | "graph" | "navigator";

const SECTIONS: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "files", label: "Files", icon: Files },
  { id: "grep", label: "Grep", icon: Search },
  { id: "graph", label: "Graph", icon: Globe },
  { id: "navigator", label: "Navigator", icon: Layers },
];

interface FilesTabProps {
  repoId: string;
  onSelectFile: (path: string) => void;
}

interface StructuralMatch {
  kind: "symbol" | "export" | "internal" | "section" | "file" | "directory" | "docstring";
  value: string;
  symbolKind?: string;
  line?: number;
  exported?: boolean;
}

interface GrepMatch {
  path: string;
  score: number;
  language: string | null;
  importers: string[];
  cochangePartners: Array<{ path: string; count: number }>;
  isHub: boolean;
  hubScore: number;
  exports: string[];
  matches: StructuralMatch[];
}

interface GrepResult {
  repoId: string;
  terms: string[];
  results: Record<string, GrepMatch[]>;
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

interface GrepTabProps {
  repoPath: string;
  onSelectFile: (path: string) => void;
}

function GrepTab({ repoPath, onSelectFile }: GrepTabProps) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const grep = useMutation({
    mutationFn: (input: { query: string; limit: number }) =>
      api.grep(repoPath, input.query, input.limit) as Promise<GrepResult>,
  });

  const runSearch = (nextQuery?: string) => {
    const value = (nextQuery ?? query).trim();
    if (!value) return;
    setSubmittedQuery(value);
    grep.mutate({ query: value, limit });
  };

  const result = grep.data;
  const totalResults = result?.terms.reduce((sum, term) => sum + (result.results[term]?.length ?? 0), 0) ?? 0;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <form
        className="flex items-center gap-2 border-b border-border px-4 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border bg-background px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms, use | for multiple terms (e.g. auth|token|session)"
            className="h-8 w-full bg-transparent text-xs focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2">
          <span className="font-mono text-[10px] text-muted-foreground">limit</span>
          <input
            type="number"
            min={1}
            max={50}
            value={limit}
            onChange={(e) => setLimit(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
            className="h-8 w-12 bg-transparent text-right font-mono text-xs focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={grep.isPending || !query.trim()}
          className="h-8 rounded-md border border-border px-3 text-xs hover:bg-accent disabled:opacity-50"
        >
          {grep.isPending ? "Searching..." : "Run grep"}
        </button>
      </form>

      <div className="flex-1 overflow-auto p-4">
        {!submittedQuery && !grep.data && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm font-medium">Lens Grep</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Enter terms in the textbox above to run `grep.post` and inspect ranked matches.
            </p>
          </div>
        )}

        {grep.isError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {grep.error instanceof Error ? grep.error.message : "Failed to run grep"}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="font-mono text-[10px]">
                {result.terms.length} terms
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px]">
                {totalResults} matches
              </Badge>
              <span className="font-mono text-[10px]">query: {submittedQuery}</span>
            </div>

            {result.terms.map((term) => {
              const matches = result.results[term] ?? [];
              return (
                <div key={term} className="overflow-hidden rounded-lg border border-border">
                  <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
                    <div className="font-mono text-xs">{term}</div>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {matches.length}
                    </Badge>
                  </div>

                  {matches.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-muted-foreground">No matches</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {matches.map((match) => (
                        <div key={`${term}:${match.path}`} className="space-y-2 px-3 py-2">
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => onSelectFile(match.path)}
                              className="min-w-0 truncate font-mono text-primary hover:underline"
                            >
                              {match.path}
                            </button>
                            <Badge variant="outline" className="font-mono text-[9px]">
                              {match.language ?? "unknown"}
                            </Badge>
                            {match.isHub && (
                              <Badge
                                variant="outline"
                                className="font-mono text-[9px] border-amber-500/50 text-amber-500"
                              >
                                hub
                              </Badge>
                            )}
                            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                              score {match.score.toFixed(2)} · hub {match.hubScore.toFixed(2)}
                            </span>
                          </div>

                          {match.matches.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {match.matches.slice(0, 6).map((m, idx) => (
                                <span
                                  key={`${match.path}:${m.kind}:${m.value}:${idx}`}
                                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                                >
                                  {m.kind}
                                  {m.symbolKind ? `:${m.symbolKind}` : ""}:{m.value}
                                  {typeof m.line === "number" ? `@${m.line}` : ""}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                            {match.importers.length > 0 && (
                              <span className="font-mono">imported by {match.importers.length}</span>
                            )}
                            {match.cochangePartners.length > 0 && (
                              <span className="font-mono">co-change {match.cochangePartners.length}</span>
                            )}
                            {match.exports.length > 0 && (
                              <span className="font-mono">exports {match.exports.length}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
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
  const openInEditor = async (line?: number) => {
    if (!filePath) return;
    try {
      await api.openFile(repoId, filePath, line);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      window.alert(`Failed to open editor: ${message}`);
    }
  };

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
              <button
                type="button"
                onClick={() => void openInEditor()}
                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/40"
              >
                <ExternalLink className="h-3 w-3" />
                Open in editor
              </button>

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

              {/* Symbols */}
              {detail.symbols && detail.symbols.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Symbols
                    </p>
                    <div className="space-y-1">
                      {detail.symbols.slice(0, 80).map((symbol) => (
                        <button
                          key={`${symbol.kind}:${symbol.name}:${symbol.line}`}
                          type="button"
                          onClick={() => void openInEditor(symbol.line)}
                          className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-accent/40"
                        >
                          <Badge variant="outline" className="h-4 px-1.5 font-mono text-[9px] lowercase">
                            {symbol.kind}
                          </Badge>
                          <span className="flex-1 break-all font-mono text-[11px] text-foreground/90">
                            {symbol.name}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">L{symbol.line}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/80" />
                          {symbol.exported && (
                            <Badge variant="secondary" className="h-4 px-1.5 font-mono text-[9px]">
                              export
                            </Badge>
                          )}
                        </button>
                      ))}
                      {detail.symbols.length > 80 && (
                        <p className="text-[10px] text-muted-foreground">+{detail.symbols.length - 80} more</p>
                      )}
                    </div>
                  </section>
                </>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);

  const initialTab: Section = (() => {
    const tab = searchParams.get("tab");
    if (tab === "files") return "files";
    if (tab === "grep") return "grep";
    if (tab === "graph") return "graph";
    if (tab === "navigator") return "navigator";
    return "overview";
  })();
  const [activeTab, setActiveTab] = useState<Section>(initialTab);
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

  useEffect(() => {
    const tab = searchParams.get("tab");
    const nextTab: Section =
      tab === "files"
        ? "files"
        : tab === "grep"
          ? "grep"
          : tab === "graph"
            ? "graph"
            : tab === "navigator"
              ? "navigator"
              : "overview";
    setActiveTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [searchParams]);

  const setSection = (section: Section) => {
    setActiveTab(section);
    const next = new URLSearchParams(searchParams);
    if (section === "overview") next.delete("tab");
    if (section === "files") next.set("tab", "files");
    if (section === "grep") next.set("tab", "grep");
    if (section === "graph") next.set("tab", "graph");
    if (section === "navigator") next.set("tab", "navigator");
    setSearchParams(next, { replace: true });
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
                onClick={() => setSection(id)}
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
            onChange={(e) => setSection(e.target.value as Section)}
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
          {activeTab === "grep" && repo && <GrepTab repoPath={repo.root_path} onSelectFile={setSelectedFilePath} />}
          {activeTab === "graph" && <RepoGraphTab repoId={repoId} />}
          {activeTab === "navigator" && <NavigatorTab repoId={repoId} />}
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
