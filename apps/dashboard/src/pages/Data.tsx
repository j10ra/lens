import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { DataTable } from "@/components/DataTable";
import { Database } from "lucide-react";

export function Data() {
	const [selectedTable, setSelectedTable] = useState<string | null>(null);
	const [page, setPage] = useState(0);
	const pageSize = 50;

	const { data: tables, isLoading } = useQuery({
		queryKey: ["dashboard-tables"],
		queryFn: api.tables,
	});

	const { data: tableData, isLoading: rowsLoading } = useQuery({
		queryKey: ["dashboard-table-rows", selectedTable, page],
		queryFn: () => api.tableRows(selectedTable!, pageSize, page * pageSize),
		enabled: !!selectedTable,
		placeholderData: keepPreviousData,
	});

	if (isLoading) return <Spinner />;

	return (
		<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
			<div className="flex gap-4 px-4 lg:px-6">
				{/* Table list sidebar */}
				<div className="w-52 shrink-0 space-y-1">
					{(tables?.tables ?? []).map((t) => (
						<button
							key={t.name}
							onClick={() => {
								setSelectedTable(t.name);
								setPage(0);
							}}
							className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
								selectedTable === t.name
									? "bg-primary/10 text-primary font-medium"
									: "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
							}`}
						>
							<span className="flex items-center gap-2">
								<Database className="h-3.5 w-3.5" />
								{t.name}
							</span>
							<span className="font-mono text-xs">{t.count}</span>
						</button>
					))}
				</div>

				{/* Table data */}
				<div className="min-w-0 flex-1">
					{!selectedTable ? (
						<div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
							Select a table to browse
						</div>
					) : rowsLoading ? (
						<Spinner />
					) : (
						<DataTable
							columns={(tableData?.columns ?? []).map((col) => ({
								key: col,
								label: col,
								render: (row) => {
									const val = row[col];
									if (val == null)
										return (
											<span className="text-muted-foreground/50">null</span>
										);
									if (typeof val === "string" && val.startsWith("{")) {
										try {
											return (
												<details className="cursor-pointer">
													<summary className="text-xs text-muted-foreground truncate max-w-xs">
														JSON
													</summary>
													<pre className="text-xs font-mono mt-1 p-2 bg-muted rounded max-h-40 overflow-auto">
														{JSON.stringify(JSON.parse(val), null, 2)}
													</pre>
												</details>
											);
										} catch {}
									}
									if (typeof val === "string" && val.startsWith("[")) {
										try {
											const arr = JSON.parse(val);
											return (
												<span className="text-xs font-mono">
													[{arr.length} items]
												</span>
											);
										} catch {}
									}
									const s = String(val);
									if (s.length > 80)
										return (
											<span className="text-xs" title={s}>
												{s.slice(0, 80)}…
											</span>
										);
									return <span className="text-xs">{s}</span>;
								},
							}))}
							rows={(tableData?.rows ?? []) as Record<string, unknown>[]}
							total={tableData?.total ?? 0}
							page={page}
							pageSize={pageSize}
							onPageChange={setPage}
						/>
					)}
				</div>
			</div>
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
