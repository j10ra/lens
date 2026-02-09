import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { timeAgo } from "@/lib/utils";
import { RefreshCw, Eye, EyeOff, ArrowLeft, Plus, Trash2, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Repos() {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [showRegister, setShowRegister] = useState(false);
	const [registerPath, setRegisterPath] = useState("");
	const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
	const queryClient = useQueryClient();

	const { data, isLoading } = useQuery({
		queryKey: ["dashboard-repos"],
		queryFn: api.repos,
		refetchInterval: 5_000,
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

	if (isLoading) return <Spinner />;

	const repos = data?.repos ?? [];
	const selected = selectedId
		? repos.find((r) => r.id === selectedId)
		: null;

	if (selected) {
		return (
			<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
				<div className="px-4 lg:px-6">
					<button
						type="button"
						onClick={() => setSelectedId(null)}
						className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft className="h-4 w-4" /> Back
					</button>
				</div>

				<div className="flex items-start justify-between px-4 lg:px-6">
					<div>
						<p className="text-lg font-semibold">{selected.name}</p>
						<p className="text-sm text-muted-foreground">
							{selected.root_path}
						</p>
					</div>
					<div className="flex gap-2">
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
				</div>

				<div className="grid gap-4 px-4 lg:px-6 @xl/main:grid-cols-2">
					<div className="rounded-lg border border-border bg-card p-4 space-y-3">
						<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
							Index
						</h3>
						<div className="grid grid-cols-2 gap-3 text-sm">
							<Stat
								label="Status"
								value={<StatusBadge status={selected.index_status} />}
							/>
							<Stat
								label="Last commit"
								value={selected.last_indexed_commit?.slice(0, 8) ?? "—"}
								mono
							/>
							<Stat label="Files" value={selected.files_indexed} />
							<Stat label="Chunks" value={selected.chunk_count} />
							<Stat label="Import depth" value={selected.max_import_depth} />
							<Stat label="Indexed" value={timeAgo(selected.last_indexed_at)} />
						</div>
					</div>

					<div className="rounded-lg border border-border bg-card p-4 space-y-3">
						<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
							Enrichment
						</h3>
						<ProgressBar
							label="Embeddings"
							value={selected.embedded_count}
							max={selected.embeddable_count}
						/>
						<ProgressBar
							label="Purpose"
							value={selected.purpose_count}
							max={selected.purpose_total}
						/>
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
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
			<div className="flex items-center justify-between px-4 lg:px-6">
				{showRegister ? (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							if (registerPath.trim()) register.mutate(registerPath.trim());
						}}
						className="flex flex-1 gap-2"
					>
						<div className="relative flex-1">
							<FolderPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<input
								type="text"
								value={registerPath}
								onChange={(e) => setRegisterPath(e.target.value)}
								placeholder="/absolute/path/to/repo"
								className="w-full rounded-md border border-border bg-card pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground"
								autoFocus
							/>
						</div>
						<Button
							type="submit"
							size="sm"
							disabled={!registerPath.trim() || register.isPending}
						>
							{register.isPending ? "Registering..." : "Register"}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => {
								setShowRegister(false);
								setRegisterPath("");
							}}
						>
							Cancel
						</Button>
					</form>
				) : (
					<>
						<div />
						<Button
							size="sm"
							variant="outline"
							onClick={() => setShowRegister(true)}
						>
							<Plus className="h-4 w-4" />
							Register Repo
						</Button>
					</>
				)}
			</div>

			{register.isError && (
				<div className="mx-4 lg:mx-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{(register.error as Error).message}
				</div>
			)}

			<div className="px-4 lg:px-6">
				<DataTable
					columns={[
						{
							key: "name",
							label: "Name",
							render: (r) => (
								<button
									onClick={() => setSelectedId(r.id as string)}
									className="text-primary hover:underline font-medium"
								>
									{r.name as string}
								</button>
							),
						},
						{
							key: "index_status",
							label: "Status",
							render: (r) => (
								<StatusBadge status={r.index_status as string} />
							),
						},
						{ key: "files_indexed", label: "Files" },
						{ key: "chunk_count", label: "Chunks" },
						{
							key: "embedded_pct",
							label: "Embed%",
							render: (r) => `${r.embedded_pct}%`,
						},
						{
							key: "last_indexed_at",
							label: "Indexed",
							render: (r) => timeAgo(r.last_indexed_at as string | null),
						},
					]}
					rows={repos as Record<string, unknown>[]}
					emptyMessage="No repos registered. Run: lens repo register"
				/>
			</div>
		</div>
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
		<button
			onClick={onClick}
			disabled={loading}
			className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
		>
			<Icon className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
			{label}
		</button>
	);
}

function Spinner() {
	return (
		<div className="flex items-center justify-center py-20">
			<div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
		</div>
	);
}
