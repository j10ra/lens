import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, PageHeader } from "@lens/ui";

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
	const pageSize = 100;

	const { data, isLoading } = useQuery({
		queryKey: ["dashboard-logs", page, source],
		queryFn: () =>
			api.logs({
				limit: pageSize,
				offset: page * pageSize,
				source: source || undefined,
			}),
		refetchInterval: 15_000,
		placeholderData: keepPreviousData,
	});

	const total = data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const rows = data?.rows ?? [];

	return (
		<>
			<PageHeader>
				<span className="text-sm font-medium">Requests</span>
				{data?.summary && (
					<div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
						<span className="tabular-nums">{data.summary.total_today} today</span>
						{data.summary.by_source.map((s) => (
							<span key={s.source} className="tabular-nums">
								<span className={`inline-block rounded px-1 py-0.5 ${SOURCE_COLORS[s.source] ?? ""}`}>
									{s.source}
								</span>{" "}
								{s.count}
							</span>
						))}
					</div>
				)}
				<div className="ml-auto">
					<select
						value={source}
						onChange={(e) => {
							setSource(e.target.value);
							setPage(0);
						}}
						className="h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
					>
						<option value="">All sources</option>
						<option value="cli">CLI</option>
						<option value="mcp">MCP</option>
						<option value="api">API</option>
						<option value="dashboard">Dashboard</option>
					</select>
				</div>
			</PageHeader>

			{/* Grid */}
			<div className="flex-1 min-h-0 overflow-auto">
				{isLoading && !data ? (
					<Spinner />
				) : (
					<table className="w-full border-collapse text-xs">
						<thead className="sticky top-0 z-10">
							<tr className="bg-muted/60 text-left">
								<th className="w-12 border-b border-r border-border bg-muted/60 px-2 py-2 text-center font-medium text-muted-foreground">#</th>
								<th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">Time</th>
								<th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">Source</th>
								<th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">Method</th>
								<th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">Path</th>
								<th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">Status</th>
								<th className="border-b border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground text-right">Duration</th>
							</tr>
						</thead>
						<tbody>
							{rows.length === 0 ? (
								<tr>
									<td colSpan={7} className="py-12 text-center text-muted-foreground">
										No requests logged yet
									</td>
								</tr>
							) : (
								rows.map((r, i) => {
									const d = new Date(r.created_at + "Z");
									const statusColor = STATUS_COLORS[String(r.status)[0]] ?? "";
									const srcColor = SOURCE_COLORS[r.source] ?? "";
									return (
										<tr key={r.id} className="group hover:bg-accent/30">
											<td className="border-b border-r border-border bg-muted/20 px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground tabular-nums">
												{page * pageSize + i + 1}
											</td>
											<td className="border-b border-r border-border px-3 py-1.5 font-mono text-muted-foreground tabular-nums">
												{d.toLocaleTimeString()}
											</td>
											<td className="border-b border-r border-border px-3 py-1.5">
												<span className={`inline-block rounded px-1.5 py-0.5 font-medium ${srcColor}`}>
													{r.source}
												</span>
											</td>
											<td className="border-b border-r border-border px-3 py-1.5 font-mono">
												{r.method}
											</td>
											<td className="border-b border-r border-border px-3 py-1.5 font-mono max-w-xs truncate">
												{r.path}
											</td>
											<td className="border-b border-r border-border px-3 py-1.5 font-mono">
												<span className={`font-medium ${statusColor}`}>{r.status}</span>
											</td>
											<td className="border-b border-border px-3 py-1.5 font-mono text-right text-muted-foreground tabular-nums">
												{formatDuration(r.duration_ms)}
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				)}
			</div>

			{/* Footer pagination */}
			{total > pageSize && (
				<div className="flex items-center justify-between border-t bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
					<span className="tabular-nums">
						{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of{" "}
						{total.toLocaleString()}
					</span>
					<div className="flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={() => setPage(page - 1)}
							disabled={page === 0}
						>
							<ChevronLeft className="h-3.5 w-3.5" />
						</Button>
						<span className="px-1.5 tabular-nums">
							{page + 1} / {totalPages}
						</span>
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={() => setPage(page + 1)}
							disabled={page >= totalPages - 1}
						>
							<ChevronRight className="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			)}
		</>
	);
}

function Spinner() {
	return (
		<div className="flex flex-1 items-center justify-center py-20">
			<div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
		</div>
	);
}
