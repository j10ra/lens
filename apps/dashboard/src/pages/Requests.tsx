import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { DataTable } from "@/components/DataTable";
import { formatDuration } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
	"2": "text-success",
	"3": "text-warning",
	"4": "text-warning",
	"5": "text-destructive",
};

const SOURCE_COLORS: Record<string, string> = {
	cli: "bg-blue-500/15 text-blue-400",
	mcp: "bg-purple-500/15 text-purple-400",
	api: "bg-emerald-500/15 text-emerald-400",
	dashboard: "bg-amber-500/15 text-amber-400",
};

export function Requests() {
	const [page, setPage] = useState(0);
	const [source, setSource] = useState<string>("");
	const [autoRefresh, setAutoRefresh] = useState(false);
	const pageSize = 50;

	const { data, isLoading } = useQuery({
		queryKey: ["dashboard-logs", page, source],
		queryFn: () =>
			api.logs({
				limit: pageSize,
				offset: page * pageSize,
				source: source || undefined,
			}),
		refetchInterval: autoRefresh ? 2_000 : false,
		placeholderData: keepPreviousData,
	});

	return (
		<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
			<div className="flex items-center justify-between px-4 lg:px-6">
				<div className="flex items-center gap-3">
					<select
						value={source}
						onChange={(e) => {
							setSource(e.target.value);
							setPage(0);
						}}
						className="rounded-md border border-border bg-card px-2 py-1 text-xs"
					>
						<option value="">All sources</option>
						<option value="cli">CLI</option>
						<option value="mcp">MCP</option>
						<option value="api">API</option>
						<option value="dashboard">Dashboard</option>
					</select>
					<label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
						<input
							type="checkbox"
							checked={autoRefresh}
							onChange={(e) => setAutoRefresh(e.target.checked)}
							className="rounded border-border"
						/>
						Auto-refresh
					</label>
				</div>
			</div>

			{/* Summary cards */}
			{data?.summary && (
				<div className="flex flex-wrap gap-3 px-4 lg:px-6">
					<MiniStat label="Today" value={data.summary.total_today} />
					{data.summary.by_source.map((s) => (
						<MiniStat key={s.source} label={s.source} value={s.count} />
					))}
				</div>
			)}

			<div className="px-4 lg:px-6">
				{isLoading ? (
					<Spinner />
				) : (
					<DataTable
						columns={[
							{
								key: "created_at",
								label: "Time",
								className: "w-36",
								render: (r) => {
									const d = new Date((r.created_at as string) + "Z");
									return (
										<span className="text-xs font-mono text-muted-foreground">
											{d.toLocaleTimeString()}
										</span>
									);
								},
							},
							{
								key: "source",
								label: "Source",
								render: (r) => {
									const src = r.source as string;
									return (
										<span
											className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${SOURCE_COLORS[src] ?? ""}`}
										>
											{src}
										</span>
									);
								},
							},
							{
								key: "method",
								label: "Method",
								className: "w-16 font-mono text-xs",
							},
							{
								key: "path",
								label: "Path",
								render: (r) => (
									<span className="font-mono text-xs">
										{r.path as string}
									</span>
								),
							},
							{
								key: "status",
								label: "Status",
								className: "w-16",
								render: (r) => {
									const s = String(r.status);
									const color = STATUS_COLORS[s[0]] ?? "";
									return (
										<span className={`font-mono font-medium ${color}`}>
											{s}
										</span>
									);
								},
							},
							{
								key: "duration_ms",
								label: "Duration",
								className: "w-20 text-right",
								render: (r) => (
									<span className="font-mono text-xs text-muted-foreground">
										{formatDuration(r.duration_ms as number)}
									</span>
								),
							},
						]}
						rows={(data?.rows ?? []) as Record<string, unknown>[]}
						total={data?.total ?? 0}
						page={page}
						pageSize={pageSize}
						onPageChange={setPage}
						emptyMessage="No requests logged yet"
					/>
				)}
			</div>
		</div>
	);
}

function MiniStat({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md border border-border bg-card px-3 py-1.5 text-xs">
			<span className="text-muted-foreground">{label}: </span>
			<span className="font-mono font-medium">{value}</span>
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
