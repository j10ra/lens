import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader, Button } from "@lens/ui";
import { api } from "@/lib/api";

export function Context() {
  const [repoId, setRepoId] = useState("");
  const [goal, setGoal] = useState("");

  const { data: repoData } = useQuery({
    queryKey: ["dashboard-repos"],
    queryFn: api.repos,
    placeholderData: keepPreviousData,
  });

  const mutation = useMutation({
    mutationFn: () => api.buildContext(repoId, goal),
  });

  const repos = repoData?.repos ?? [];

  useEffect(() => {
    if (!repoId && repos.length > 0) setRepoId(repos[0].id);
  }, [repoId, repos]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoId || !goal.trim()) return;
    mutation.mutate();
  };

  const stats = mutation.data?.stats;

  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium">Context</span>
      </PageHeader>

      <div className="flex flex-1 min-h-0 flex-col gap-3 py-3">
        <form
          onSubmit={handleSubmit}
          className="shrink-0 flex flex-col gap-2 px-3"
        >
          <div className="flex items-center gap-2">
            <select
              value={repoId}
              onChange={(e) => setRepoId(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select repo...</option>
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Describe your goal..."
              className="h-8 flex-1 rounded-md border border-border bg-background px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />

            <Button
              type="submit"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={!repoId || !goal.trim() || mutation.isPending}
            >
              {mutation.isPending ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              Query
            </Button>
          </div>

          {stats && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
                {stats.files_in_context} files
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
                {stats.duration_ms}ms
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5">
                {stats.cached ? "cached" : "fresh"}
              </span>
              {!stats.index_fresh && (
                <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive">
                  stale
                </span>
              )}
            </div>
          )}
        </form>

        {mutation.isError && (
          <div className="shrink-0 mx-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {(mutation.error as Error).message}
          </div>
        )}

        {mutation.isPending ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : mutation.data ? (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/60 text-left">
                  <th className="w-12 border-b border-r border-border bg-muted/60 px-2 py-2 text-center font-medium text-muted-foreground">
                    #
                  </th>
                  <th className="border-b border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">
                    Context Pack
                    <span className="ml-2 font-normal text-muted-foreground/60">
                      {mutation.data.context_pack.split("\n").length} lines
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {mutation.data.context_pack.split("\n").map((line, i) => (
                  <tr key={i} className="group hover:bg-accent/30">
                    <td className="border-b border-r border-border bg-muted/20 px-2 py-0 text-center font-mono text-[10px] text-muted-foreground/50 tabular-nums select-none align-top leading-5">
                      {i + 1}
                    </td>
                    <td className="border-b border-border px-3 py-0 font-mono leading-5 whitespace-pre-wrap break-all">
                      {line || "\u00A0"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Send className="mb-2 h-6 w-6 opacity-30" />
            <p className="text-xs">Select a repo and describe your goal</p>
          </div>
        )}
      </div>
    </>
  );
}
