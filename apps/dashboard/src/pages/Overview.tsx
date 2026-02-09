import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { StatsCard } from "@/components/StatsCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { timeAgo } from "@/lib/utils";

export function Overview() {
	const { data: stats, isLoading } = useQuery({
		queryKey: ["dashboard-stats"],
		queryFn: api.stats,
		refetchInterval: 5_000,
		placeholderData: keepPreviousData,
	});

	const { data: repoData } = useQuery({
		queryKey: ["dashboard-repos"],
		queryFn: api.repos,
		refetchInterval: 5_000,
		placeholderData: keepPreviousData,
	});

	if (isLoading) return <Loading />;

	const uptime = stats?.uptime_seconds ?? 0;
	const uptimeStr =
		uptime < 60
			? `${uptime}s`
			: uptime < 3600
				? `${Math.floor(uptime / 60)}m`
				: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

	return (
		<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
			{/* Stats grid */}
			<div className="*:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card *:data-[slot=card]:shadow-xs grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-5">
				<StatsCard
					label="Repos"
					value={stats?.repos_count ?? 0}
					description="Registered repositories"
				/>
				<StatsCard
					label="Chunks"
					value={(stats?.total_chunks ?? 0).toLocaleString()}
					description="Indexed code segments"
				/>
				<StatsCard
					label="Embeddings"
					value={(stats?.total_embeddings ?? 0).toLocaleString()}
					description="Vector embeddings"
				/>
				<StatsCard
					label="DB Size"
					value={`${stats?.db_size_mb ?? 0} MB`}
					description="SQLite database"
				/>
				<StatsCard
					label="Uptime"
					value={uptimeStr}
					description="Daemon process"
				/>
			</div>

			{/* Repos */}
			{repoData?.repos && repoData.repos.length > 0 && (
				<div className="space-y-3 px-4 lg:px-6">
					<h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
						Repositories
					</h2>
					<div className="grid gap-3 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
						{repoData.repos.map((repo) => (
							<Card key={repo.id} className="py-4">
								<CardHeader className="pb-2">
									<div className="flex items-start justify-between">
										<div className="min-w-0">
											<CardTitle className="text-sm truncate">
												{repo.name}
											</CardTitle>
											<p className="text-xs text-muted-foreground truncate">
												{repo.root_path}
											</p>
										</div>
										<StatusBadge status={repo.index_status} />
									</div>
								</CardHeader>
								<CardContent>
									<div className="grid grid-cols-3 gap-2 text-xs">
										<div>
											<p className="text-muted-foreground">Files</p>
											<p className="font-mono font-medium tabular-nums">
												{repo.files_indexed}
											</p>
										</div>
										<div>
											<p className="text-muted-foreground">Chunks</p>
											<p className="font-mono font-medium tabular-nums">
												{repo.chunk_count}
											</p>
										</div>
										<div>
											<p className="text-muted-foreground">Embed</p>
											<p className="font-mono font-medium tabular-nums">
												{repo.embedded_pct}%
											</p>
										</div>
									</div>
									<p className="text-xs text-muted-foreground mt-2">
										Indexed {timeAgo(repo.last_indexed_at)}
									</p>
								</CardContent>
							</Card>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function Loading() {
	return (
		<div className="flex items-center justify-center py-20">
			<div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
		</div>
	);
}
