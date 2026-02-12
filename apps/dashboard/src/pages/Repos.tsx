import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { timeAgo } from "@/lib/utils";
import { Plus, FolderPlus, RefreshCw, Eye, EyeOff, Sparkles } from "lucide-react";
import { Badge, Button, PageHeader, Switch } from "@lens/ui";

type RepoItem = Awaited<ReturnType<typeof api.repos>>["repos"][number];

export function Repos() {
	const [showRegister, setShowRegister] = useState(false);
	const [registerPath, setRegisterPath] = useState("");
	const queryClient = useQueryClient();

	const { data: usage } = useQuery({
		queryKey: ["dashboard-usage"],
		queryFn: api.localUsage,
		refetchInterval: 30_000,
	});
	const isPro = (usage?.plan ?? "free") === "pro";

	const { data } = useQuery({
		queryKey: ["dashboard-repos"],
		queryFn: api.repos,
		refetchInterval: 30_000,
		placeholderData: keepPreviousData,
	});

	const register = useMutation({
		mutationFn: (rootPath: string) => api.registerRepo(rootPath),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["dashboard-repos"] });
			setShowRegister(false);
			setRegisterPath("");
		},
	});

	const repos = data?.repos ?? [];

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

			<div className="flex-1 min-h-0 overflow-auto">
				{repos.length === 0 ? (
					<p className="text-sm text-muted-foreground py-12 text-center">
						No repos registered. Run: <code className="text-xs">lens repo register</code>
					</p>
				) : (
					<div className="grid gap-3 p-3 @xl/main:grid-cols-2">
						{repos.map((r) => (
							<RepoCard key={r.id} repo={r} isPro={isPro} />
						))}
					</div>
				)}
			</div>
		</>
	);
}

function RepoCard({ repo, isPro }: { repo: RepoItem; isPro: boolean }) {
	const queryClient = useQueryClient();

	const reindex = useMutation({
		mutationFn: api.reindex,
		onMutate: (id) => {
			queryClient.setQueryData(["dashboard-repos"], (old: Awaited<ReturnType<typeof api.repos>> | undefined) => {
				if (!old) return old;
				return { ...old, repos: old.repos.map((r) => r.id === id ? { ...r, index_status: "indexing" } : r) };
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

	const updateSettings = useMutation({
		mutationFn: (settings: { enable_embeddings?: boolean; enable_summaries?: boolean; enable_vocab_clusters?: boolean }) =>
			api.updateRepoSettings(repo.id, settings),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-repos"] }),
	});

	const embPct = repo.embeddable_count > 0
		? Math.round((repo.embedded_count / repo.embeddable_count) * 100) : 0;
	const purPct = repo.purpose_total > 0
		? Math.round((repo.purpose_count / repo.purpose_total) * 100) : 0;

	return (
		<div className="rounded-lg border bg-card">
			{/* Header */}
			<div className="flex items-start justify-between gap-2 p-3 pb-2">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<Link
							to="/repos/$repoId"
							params={{ repoId: repo.id }}
							className="text-sm font-medium text-primary hover:underline truncate"
						>
							{repo.name}
						</Link>
						<StatusBadge status={repo.index_status} />
					</div>
					<p className="text-[10px] text-muted-foreground truncate mt-0.5">{repo.root_path}</p>
				</div>
				<div className="flex items-center gap-1 shrink-0">
					<Button
						variant="ghost"
						size="sm"
						className="h-6 w-6 p-0"
						onClick={() => reindex.mutate(repo.id)}
						disabled={reindex.isPending}
						title="Re-index"
					>
						<RefreshCw className={`h-3.5 w-3.5 ${reindex.isPending ? "animate-spin" : ""}`} />
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-6 w-6 p-0"
						onClick={() => (repo.watcher.active ? stopWatch : startWatch).mutate(repo.id)}
						title={repo.watcher.active ? "Stop watcher" : "Start watcher"}
					>
						{repo.watcher.active
							? <EyeOff className="h-3.5 w-3.5" />
							: <Eye className="h-3.5 w-3.5" />
						}
					</Button>
				</div>
			</div>

			{/* Stats */}
			<div className="grid grid-cols-4 gap-2 px-3 pb-2 text-xs">
				<Kv label="Files" value={repo.files_indexed} />
				<Kv label="Chunks" value={repo.chunk_count.toLocaleString()} />
				<Kv label="Commit" value={repo.last_indexed_commit?.slice(0, 7) ?? "\u2014"} mono />
				<Kv label="Indexed" value={timeAgo(repo.last_indexed_at)} />
			</div>

			{/* Enrichment */}
			<div className="border-t px-3 py-2 space-y-2">
				<div className="flex items-center gap-1.5">
					<Sparkles className="h-3 w-3 text-muted-foreground" />
					<span className="text-[10px] font-medium text-muted-foreground">Enrichment</span>
					{!isPro && (
						<Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-500 border-amber-500/40">Pro</Badge>
					)}
				</div>
				<div className="space-y-1.5">
					<ToggleProgress
						label="Embeddings"
						value={repo.embedded_count}
						max={repo.embeddable_count}
						pct={embPct}
						enabled={!!repo.enable_embeddings}
						onToggle={(v) => updateSettings.mutate({ enable_embeddings: v })}
						disabled={!isPro}
					/>
					<ToggleProgress
						label="Summaries"
						value={repo.purpose_count}
						max={repo.purpose_total}
						pct={purPct}
						enabled={!!repo.enable_summaries}
						onToggle={(v) => updateSettings.mutate({ enable_summaries: v })}
						disabled={!isPro}
					/>
					<ToggleCount
						label="Vocab clusters"
						count={repo.vocab_cluster_count}
						enabled={!!repo.enable_vocab_clusters}
						onToggle={(v) => updateSettings.mutate({ enable_vocab_clusters: v })}
						disabled={!isPro}
					/>
					{!isPro && (
						<Link to="/billing" className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-3 py-1.5 text-[11px] font-medium text-amber-500 hover:bg-amber-500/10 mt-1">
							<Sparkles className="h-3 w-3" />
							Upgrade to Pro
						</Link>
					)}
				</div>
			</div>
		</div>
	);
}

function ToggleProgress({
	label,
	value,
	max,
	pct,
	enabled,
	onToggle,
	disabled,
}: {
	label: string;
	value: number;
	max: number;
	pct: number;
	enabled: boolean;
	onToggle: (v: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<div className={`flex items-center gap-2 ${enabled && !disabled ? "" : "opacity-50"}`}>
			<Switch
				checked={enabled}
				onCheckedChange={onToggle}
				disabled={disabled}
				className="scale-75 origin-left shrink-0"
			/>
			<div className="flex-1 min-w-0">
				<div className="flex items-baseline justify-between mb-0.5">
					<span className="text-[10px] text-muted-foreground">{label}</span>
					<span className="font-mono text-[10px] tabular-nums text-muted-foreground">
						{value}/{max}
					</span>
				</div>
				<div className="h-1 w-full rounded-full bg-muted overflow-hidden">
					<div
						className="h-full rounded-full bg-primary transition-all"
						style={{ width: `${pct}%` }}
					/>
				</div>
			</div>
		</div>
	);
}

function ToggleCount({
	label,
	count,
	enabled,
	onToggle,
	disabled,
}: {
	label: string;
	count: number;
	enabled: boolean;
	onToggle: (v: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<div className={`flex items-center gap-2 ${enabled && !disabled ? "" : "opacity-50"}`}>
			<Switch
				checked={enabled}
				onCheckedChange={onToggle}
				disabled={disabled}
				className="scale-75 origin-left shrink-0"
			/>
			<div className="flex items-baseline justify-between flex-1">
				<span className="text-[10px] text-muted-foreground">{label}</span>
				<span className="font-mono text-[10px] tabular-nums text-muted-foreground">{count}</span>
			</div>
		</div>
	);
}

function Kv({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
	return (
		<div>
			<span className="text-[10px] text-muted-foreground block">{label}</span>
			<span className={`text-xs font-medium tabular-nums ${mono ? "font-mono" : ""}`}>{value}</span>
		</div>
	);
}
