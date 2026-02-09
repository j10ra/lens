import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { timeAgo } from "@/lib/utils";
import { RefreshCw, Eye, EyeOff } from "lucide-react";

export function Jobs() {
	const queryClient = useQueryClient();

	const { data, isLoading } = useQuery({
		queryKey: ["dashboard-jobs"],
		queryFn: api.jobs,
		refetchInterval: 3_000,
		placeholderData: keepPreviousData,
	});

	const reindex = useMutation({
		mutationFn: api.reindex,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["dashboard-jobs"] }),
	});

	const startWatch = useMutation({
		mutationFn: api.startWatcher,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["dashboard-jobs"] }),
	});

	const stopWatch = useMutation({
		mutationFn: api.stopWatcher,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["dashboard-jobs"] }),
	});

	if (isLoading) return <Spinner />;

	const repos = data?.repos ?? [];

	return (
		<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
			{repos.length === 0 ? (
				<p className="text-sm text-muted-foreground py-10 text-center">
					No repos registered
				</p>
			) : (
				<div className="grid gap-4 px-4 lg:px-6 @xl/main:grid-cols-2">
					{repos.map((repo) => (
						<div
							key={repo.id}
							className="rounded-lg border border-border bg-card p-4 space-y-4"
						>
							<div className="flex items-start justify-between">
								<div>
									<p className="text-sm font-medium">{repo.name}</p>
									<p className="text-xs text-muted-foreground">
										{timeAgo(repo.last_indexed_at)}
									</p>
								</div>
								<div className="flex items-center gap-2">
									<button
										onClick={() => reindex.mutate(repo.id)}
										disabled={reindex.isPending}
										className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
										title="Re-index"
									>
										<RefreshCw
											className={`h-3.5 w-3.5 ${reindex.isPending ? "animate-spin" : ""}`}
										/>
									</button>
									<button
										onClick={() =>
											(repo.watcher.active ? stopWatch : startWatch).mutate(
												repo.id,
											)
										}
										className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
										title={
											repo.watcher.active ? "Stop watcher" : "Start watcher"
										}
									>
										{repo.watcher.active ? (
											<EyeOff className="h-3.5 w-3.5" />
										) : (
											<Eye className="h-3.5 w-3.5" />
										)}
									</button>
								</div>
							</div>

							{/* Index status */}
							<div className="space-y-1">
								<div className="flex items-center justify-between">
									<span className="text-xs text-muted-foreground">Index</span>
									<div className="flex items-center gap-2">
										<StatusBadge status={repo.index_status} />
										{repo.is_stale && (
											<span className="text-xs text-warning font-medium">
												stale
											</span>
										)}
									</div>
								</div>
								<p className="text-xs font-mono text-muted-foreground">
									{repo.last_indexed_commit?.slice(0, 8) ?? "—"}
									{repo.current_head &&
										repo.last_indexed_commit !== repo.current_head && (
											<span> → {repo.current_head.slice(0, 8)}</span>
										)}
								</p>
							</div>

							{/* Embedding progress */}
							<ProgressBar
								label="Embeddings"
								value={repo.embedded_count}
								max={repo.embeddable_count}
							/>

							{/* Purpose progress */}
							<ProgressBar
								label="Purpose"
								value={repo.purpose_count}
								max={repo.purpose_total}
							/>

							{/* Watcher */}
							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground">Watcher</span>
								<div className="flex items-center gap-2">
									<StatusBadge
										status={repo.watcher.active ? "active" : "inactive"}
									/>
									{repo.watcher.changed_files > 0 && (
										<span className="text-muted-foreground">
											{repo.watcher.changed_files} pending
										</span>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function Spinner() {
	return (
		<div className="flex items-center justify-center py-20">
			<div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
		</div>
	);
}
