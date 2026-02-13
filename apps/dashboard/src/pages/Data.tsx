import { Button, PageHeader } from "@lens/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Database, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";

export function Data() {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const pageSize = 100;

  const { data: tables, isLoading } = useQuery({
    queryKey: ["dashboard-tables"],
    queryFn: api.tables,
    placeholderData: keepPreviousData,
  });

  const { data: tableData, isLoading: rowsLoading } = useQuery({
    queryKey: ["dashboard-table-rows", selectedTable, page],
    queryFn: () => api.tableRows(selectedTable!, pageSize, page * pageSize),
    enabled: !!selectedTable,
    placeholderData: keepPreviousData,
  });

  const filteredTables = useMemo(() => {
    const all = tables?.tables ?? [];
    if (!tableFilter) return all;
    const q = tableFilter.toLowerCase();
    return all.filter((t) => t.name.toLowerCase().includes(q));
  }, [tables, tableFilter]);

  const filteredRows = useMemo(() => {
    const rows = (tableData?.rows ?? []) as Record<string, unknown>[];
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((row) => Object.values(row).some((v) => v != null && String(v).toLowerCase().includes(q)));
  }, [tableData, search]);

  const total = search ? filteredRows.length : (tableData?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const columns = tableData?.columns ?? [];

  if (!tables && isLoading) return <Spinner />;

  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium">Data</span>
        {selectedTable && (
          <>
            <span className="text-xs text-muted-foreground">{selectedTable}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {total.toLocaleString()} row{total !== 1 ? "s" : ""}
            </span>
          </>
        )}
        {/* Mobile table selector */}
        <select
          value={selectedTable ?? ""}
          onChange={(e) => {
            setSelectedTable(e.target.value || null);
            setPage(0);
            setSearch("");
          }}
          className="h-7 rounded-md border border-border bg-background px-2 text-xs md:hidden"
        >
          <option value="">Select table...</option>
          {(tables?.tables ?? []).map((t) => (
            <option key={t.name} value={t.name}>
              {t.name} ({t.count})
            </option>
          ))}
        </select>
        {selectedTable && (
          <div className="ml-auto relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter rows..."
              className="h-7 w-40 rounded-md border border-border bg-background pl-7 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}
      </PageHeader>
      <div className="flex flex-1 min-h-0">
        {/* Table list sidebar */}
        <div className="hidden w-56 shrink-0 flex-col border-r border-border bg-muted/30 md:flex">
          <div className="border-b px-3 py-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                placeholder="Search tables..."
                className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {filteredTables.map((t) => (
              <button
                type="button"
                key={t.name}
                onClick={() => {
                  setSelectedTable(t.name);
                  setPage(0);
                  setSearch("");
                }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors ${
                  selectedTable === t.name
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Database className="h-3 w-3 shrink-0 opacity-50" />
                  <span className="truncate">{t.name}</span>
                </span>
                <span className="ml-2 shrink-0 font-mono text-[10px] tabular-nums opacity-60">{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main grid area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!selectedTable ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <div className="text-center">
                <Database className="mx-auto mb-2 h-8 w-8 opacity-30" />
                <p>Select a table to browse rows</p>
              </div>
            </div>
          ) : (
            <>
              {/* Grid */}
              <div className="flex-1 min-h-0 overflow-auto">
                {rowsLoading && !tableData ? (
                  <Spinner />
                ) : (
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-muted/60 text-left">
                        <th className="w-12 border-b border-r border-border bg-muted/60 px-2 py-2 text-center font-medium text-muted-foreground">
                          #
                        </th>
                        {columns.map((col) => (
                          <th
                            key={col}
                            className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={columns.length + 1} className="py-12 text-center text-muted-foreground">
                            {search ? "No matching rows" : "Empty table"}
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row, ri) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: raw SQL rows have no stable identity
                          <tr key={ri} className="group hover:bg-accent/30">
                            <td className="border-b border-r border-border bg-muted/20 px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground tabular-nums">
                              {page * pageSize + ri + 1}
                            </td>
                            {columns.map((col) => (
                              <td key={col} className="border-b border-r border-border px-3 py-1.5 font-mono">
                                <CellValue value={row[col]} />
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer pagination */}
              {total > pageSize && (
                <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-xs" onClick={() => setPage(page - 1)} disabled={page === 0}>
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
          )}
        </div>
      </div>
    </>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (value == null) {
    return <span className="italic text-muted-foreground/40">NULL</span>;
  }

  const s = String(value);

  // JSON object
  if (typeof value === "string" && (s.startsWith("{") || s.startsWith("["))) {
    try {
      const parsed = JSON.parse(s);
      const preview = Array.isArray(parsed) ? `[${parsed.length}]` : `{${Object.keys(parsed).length}}`;
      return (
        <details className="cursor-pointer">
          <summary className="text-muted-foreground hover:text-foreground">{preview}</summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[10px] leading-relaxed">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        </details>
      );
    } catch {}
  }

  // Blob placeholder
  if (s.startsWith("<blob ")) {
    return <span className="italic text-muted-foreground/50">{s}</span>;
  }

  // Boolean
  if (value === 0 || value === 1) {
    // Could be boolean in SQLite — just show as-is
  }

  // Long strings
  if (s.length > 120) {
    return (
      <span className="cursor-help" title={s}>
        {s.slice(0, 120)}
        <span className="text-muted-foreground">...</span>
      </span>
    );
  }

  return <>{s}</>;
}

function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
