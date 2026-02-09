import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { Send, Clock, FileCode, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  // Auto-select first repo if none selected
  if (!repoId && repos.length > 0) {
    setRepoId(repos[0].id);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoId || !goal.trim()) return;
    mutation.mutate();
  };

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      {/* Query form */}
      <form onSubmit={handleSubmit} className="space-y-3 px-4 lg:px-6">
        <div className="flex gap-3">
          <select
            value={repoId}
            onChange={(e) => setRepoId(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm min-w-[200px]"
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
            placeholder="Describe your goal... e.g. 'add user authentication'"
            className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground"
          />
          <Button
            type="submit"
            disabled={!repoId || !goal.trim() || mutation.isPending}
            size="sm"
          >
            {mutation.isPending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Send />
            )}
            Query
          </Button>
        </div>
      </form>

      {/* Error */}
      {mutation.isError && (
        <div className="mx-4 lg:mx-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {(mutation.error as Error).message}
        </div>
      )}

      {/* Results */}
      {mutation.data && (
        <>
          {/* Stats bar */}
          <div className="flex flex-wrap gap-3 px-4 lg:px-6">
            <Badge variant="outline" className="gap-1.5">
              <FileCode className="size-3" />
              {mutation.data.stats.files_in_context} files
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <Clock className="size-3" />
              {mutation.data.stats.duration_ms}ms
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <Zap className="size-3" />
              {mutation.data.stats.cached ? "cached" : "fresh"}
            </Badge>
            {!mutation.data.stats.index_fresh && (
              <Badge variant="destructive" className="gap-1.5">
                index stale
              </Badge>
            )}
          </div>

          {/* Context pack */}
          <div className="px-4 lg:px-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Context Pack</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-auto rounded-md bg-muted p-4 text-xs font-mono leading-relaxed max-h-[600px] whitespace-pre-wrap">
                  {mutation.data.context_pack}
                </pre>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Empty state */}
      {!mutation.data && !mutation.isPending && !mutation.isError && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Send className="h-8 w-8 mb-3 opacity-40" />
          <p className="text-sm">Select a repo and describe your goal to generate a context pack</p>
          <p className="text-xs mt-1">This calls POST /context — the core LENS query</p>
        </div>
      )}
    </div>
  );
}
