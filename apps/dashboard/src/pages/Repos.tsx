import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { timeAgo } from "@/lib/utils";
import { RefreshCw, Eye, EyeOff, ArrowLeft, Plus, Trash2, FolderPlus } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, PageHeader } from "@lens/ui";

export function Repos() {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [showRegister, setShowRegister] = useState(false);
	const [registerPath, setRegisterPath] = useState("");
	const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
	const queryClient = useQueryClient();

	const { data, isLoading } = useQuery({
		queryKey: ["dashboard-repos"],
		queryFn: api.repos,
		refetchInterval: 30_000,
		placeholderData: keepPreviousData,
	});

	const reindex = useMutation({
		mutationFn: api.reindex,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["dashboard-repos"] }),
	});

	const startWatch = useMutation({
		mutationFn: api.startWatcher,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["dashboard-repos"] }),
	});

	const stopWatch = useMutation({
		mutationFn: api.stopWatcher,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["dashboard-repos"] }),
	});

	const register = useMutation({
		mutationFn: (rootPath: string) => api.registerRepo(rootPath),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["dashboard-repos"] });
			setShowRegister(false);
			setRegisterPath("");
		},
	});

	const remove = useMutation({
		mutationFn: api.removeRepo,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["dashboard-repos"] });
			setConfirmRemove(null);
			setSelectedId(null);
		},
	});

	const repos = data?.repos ?? [];
	const selected = selectedId
		? repos.find((r) => r.id === selectedId)
		: null;

	if (selected) {
		return (
			<>
				<PageHeader>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setSelectedId(null)}
						className="gap-1 -ml-2"
					>
						<ArrowLeft className="h-3.5 w-3.5" /> Back
					</Button>
					<span className="text-sm font-medium">{selected.name}</span>
					<span className="text-xs text-muted-foreground truncate hidden md:inline">{selected.root_path}</span>
					<div className="ml-auto flex gap-2">
						<ActionBtn
							onClick={() => reindex.mutate(selected.id)}
							icon={RefreshCw}
							label="Re-index"
							loading={reindex.isPending}
						/>
						{selected.watcher.active ? (
							<ActionBtn
								onClick={() => stopWatch.mutate(selected.id)}
								icon={EyeOff}
								label="Stop watcher"
							/>
						) : (
							<ActionBtn
								onClick={() => startWatch.mutate(selected.id)}
								icon={Eye}
								label="Start watcher"
							/>
						)}
						{confirmRemove === selected.id ? (
							<>
								<Button
									variant="destructive"
									size="sm"
									onClick={() => remove.mutate(selected.id)}
									disabled={remove.isPending}
								>
									{remove.isPending ? "Removing..." : "Confirm"}
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setConfirmRemove(null)}
								>
									Cancel
								</Button>
							</>
						) : (
							<ActionBtn
								onClick={() => setConfirmRemove(selected.id)}
								icon={Trash2}
								label="Remove"
							/>
						)}
					</div>
				</PageHeader>

				<div className="flex-1 min-h-0 overflow-auto grid gap-4 p-4 lg:p-6 @xl/main:grid-cols-2 content-start">
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Index
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 gap-3 text-sm">
							<Stat
								label="Status"
								value={<StatusBadge status={selected.index_status} />}
							/>
							<Stat
								label="Last commit"
								value={selected.last_indexed_commit?.slice(0, 8) ?? "\u2014"}
								mono
							/>
							<Stat label="Files" value={selected.files_indexed} />
							<Stat label="Chunks" value={selected.chunk_count} />
							<Stat label="Import depth" value={selected.max_import_depth} />
							<Stat label="Indexed" value={timeAgo(selected.last_indexed_at)} />
						</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Enrichment
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							{selected.has_capabilities ? (
								<>
									<ProgressBar
										label="Embeddings"
										value={selected.embedded_count}
										max={selected.embeddable_count}
									/>
									<ProgressBar
										label="Vocab clusters"
										value={selected.vocab_cluster_count}
										max={selected.vocab_cluster_count || 1}
									/>
									<ProgressBar
										label="Purpose"
										value={selected.purpose_count}
										max={selected.purpose_total}
									/>
								</>
							) : (
								<div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
									<p className="text-xs font-medium text-amber-600 dark:text-amber-400">
										⚡ Pro — Embeddings · Vocab clusters · Summaries
									</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										<code className="text-[10px]">lens login</code> → upgrade to enable
									</p>
								</div>
							)}
							<div className="pt-1">
								<Stat
									label="Watcher"
									value={
										<StatusBadge
											status={selected.watcher.active ? "active" : "inactive"}
										/>
									}
								/>
								{selected.watcher.active &&
									selected.watcher.changed_files > 0 && (
										<p className="text-xs text-muted-foreground mt-1">
											{selected.watcher.changed_files} changed files pending
										</p>
									)}
							</div>
						</CardContent>
					</Card>
				</div>
			</>
		);
	}

	return (
		<>
			<PageHeader>
				{showRegister ? (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							if (registerPath.trim()) register.mutate(registerPath.trim());
						}}
						className="flex flex-1 items-center gap-2"
					>
						<div className="relative flex-1">
							<FolderPlus className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
							<input
								type="text"
								value={registerPath}
								onChange={(e) => setRegisterPath(e.target.value)}
								placeholder="/absolute/path/to/repo"
								className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
								autoFocus
							/>
						</div>
						<Button
							type="submit"
							size="sm"
							className="h-7 text-xs"
							disabled={!registerPath.trim() || register.isPending}
						>
							{register.isPending ? "Registering..." : "Register"}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 text-xs"
							onClick={() => {
								setShowRegister(false);
								setRegisterPath("");
							}}
						>
							Cancel
						</Button>
						{register.isError && (
							<span className="text-xs text-destructive">{(register.error as Error).message}</span>
						)}
					</form>
				) : (
					<>
						<span className="text-sm font-medium">Repositories</span>
						<span className="text-xs text-muted-foreground">{repos.length} total</span>
						<div className="ml-auto">
							<Button
								variant="ghost"
								size="sm"
								className="h-7 gap-1.5 text-xs"
								onClick={() => setShowRegister(true)}
							>
								<Plus className="h-3.5 w-3.5" />
								Register
							</Button>
						</div>
					</>
				)}
			</PageHeader>

			{/* Grid */}
			<div className="flex-1 min-h-0 overflow-auto">
				<table className="w-full border-collapse text-xs">
					<thead className="sticky top-0 z-10">
						<tr className="bg-muted/60 text-left">
							<th className="w-12 border-b border-r border-border bg-muted/60 px-2 py-2 text-center font-medium text-muted-foreground">#</th>
							<th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">Name</th>
							<th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">Status</th>
							<th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground text-right">Files</th>
							<th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground text-right">Chunks</th>
							<th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground text-right">Embed%</th>
							<th className="border-b border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">Indexed</th>
						</tr>
					</thead>
					<tbody>
						{repos.length === 0 ? (
							<tr>
								<td colSpan={7} className="py-12 text-center text-muted-foreground">
									No repos registered. Run: lens repo register
								</td>
							</tr>
						) : (
							repos.map((r, i) => (
								<tr key={r.id} className="group hover:bg-accent/30">
									<td className="border-b border-r border-border bg-muted/20 px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground tabular-nums">{i + 1}</td>
									<td className="border-b border-r border-border px-3 py-1.5">
										<button
											type="button"
											onClick={() => setSelectedId(r.id)}
											className="text-primary hover:underline font-medium"
										>
											{r.name}
										</button>
									</td>
									<td className="border-b border-r border-border px-3 py-1.5">
										<StatusBadge status={r.index_status} />
									</td>
									<td className="border-b border-r border-border px-3 py-1.5 font-mono text-right tabular-nums">{r.files_indexed}</td>
									<td className="border-b border-r border-border px-3 py-1.5 font-mono text-right tabular-nums">{r.chunk_count}</td>
									<td className="border-b border-r border-border px-3 py-1.5 font-mono text-right tabular-nums">{r.embedded_pct}%</td>
									<td className="border-b border-border px-3 py-1.5 text-muted-foreground">{timeAgo(r.last_indexed_at)}</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</>
	);
}

function Stat({
	label,
	value,
	mono,
}: { label: string; value: React.ReactNode; mono?: boolean }) {
	return (
		<div>
			<p className="text-xs text-muted-foreground">{label}</p>
			<div className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>
				{value}
			</div>
		</div>
	);
}

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
		<Button
			variant="outline"
			size="sm"
			onClick={onClick}
			disabled={loading}
			className="gap-1.5"
		>
			<Icon className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
			{label}
		</Button>
	);
}

function Spinner() {
	return (
		<div className="flex items-center justify-center py-20">
			<div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
		</div>
	);
}
