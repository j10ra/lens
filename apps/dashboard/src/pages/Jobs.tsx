import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { timeAgo } from "@/lib/utils";
import { RefreshCw, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, Button, PageHeader } from "@lens/ui";

export function Jobs() {
	const queryClient = useQueryClient();

	const { data, isLoading } = useQuery({
		queryKey: ["dashboard-jobs"],
		queryFn: api.jobs,
		refetchInterval: 15_000,
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

	const repos = data?.repos ?? [];

	return (
		<>
			<PageHeader>
				<span className="text-sm font-medium">Jobs</span>
				<span className="text-xs text-muted-foreground">{repos.length} repos</span>
			</PageHeader>
			<div className="flex-1 min-h-0 overflow-auto flex flex-col gap-4 py-4 md:gap-6 md:py-6">
			{repos.length === 0 ? (
				<p className="text-sm text-muted-foreground py-10 text-center">
					No repos registered
				</p>
			) : (
				<div className="grid gap-4 px-4 lg:px-6 @xl/main:grid-cols-2">
					{repos.map((repo) => (
						<Card key={repo.id}>
							<CardHeader className="flex flex-row items-start justify-between pb-2">
								<div>
									<p className="text-sm font-medium">{repo.name}</p>
									<p className="text-xs text-muted-foreground">
										{timeAgo(repo.last_indexed_at)}
									</p>
								</div>
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										size="icon-xs"
										onClick={() => reindex.mutate(repo.id)}
										disabled={reindex.isPending}
										title="Re-index"
									>
										<RefreshCw
											className={`h-3.5 w-3.5 ${reindex.isPending ? "animate-spin" : ""}`}
										/>
									</Button>
									<Button
										variant="outline"
										size="icon-xs"
										onClick={() =>
											(repo.watcher.active ? stopWatch : startWatch).mutate(
												repo.id,
											)
										}
										title={
											repo.watcher.active ? "Stop watcher" : "Start watcher"
										}
									>
										{repo.watcher.active ? (
											<EyeOff className="h-3.5 w-3.5" />
										) : (
											<Eye className="h-3.5 w-3.5" />
										)}
									</Button>
								</div>
							</CardHeader>

							<CardContent className="space-y-4">
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
										{repo.last_indexed_commit?.slice(0, 8) ?? "\u2014"}
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
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
		</>
	);
}

function Spinner() {
	return (
		<div className="flex items-center justify-center py-20">
			<div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
		</div>
	);
}
