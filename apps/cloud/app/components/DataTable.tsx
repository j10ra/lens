import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, cn } from "@lens/ui";

interface Column<T> {
  key: string;
  label: React.ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[];
  rows: T[];
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
  toolbar?: React.ReactNode;
  showRowNumbers?: boolean;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  total = rows.length,
  page = 0,
  pageSize = 50,
  onPageChange,
  emptyMessage = "No data",
  toolbar,
  showRowNumbers = true,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {toolbar && (
        <div className="flex items-center gap-2 border-b px-3 py-2">
          {toolbar}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/60 text-left">
              {showRowNumbers && (
                <th className="w-12 border-b border-r border-border bg-muted/60 px-2 py-2 text-center font-medium text-muted-foreground">
                  #
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground last:border-r-0",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.className,
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (showRowNumbers ? 1 : 0)}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="group hover:bg-accent/30">
                  {showRowNumbers && (
                    <td className="border-b border-r border-border bg-muted/20 px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground tabular-nums">
                      {page * pageSize + i + 1}
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "border-b border-r border-border px-3 py-1.5 last:border-r-0",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
                        col.className,
                      )}
                    >
                      {col.render ? col.render(row) : <CellValue value={row[col.key]} />}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > pageSize && onPageChange && (
        <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of{" "}
            {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onPageChange(page - 1)}
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
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (value == null) {
    return <span className="italic text-muted-foreground/40">NULL</span>;
  }

  const s = String(value);

  if (typeof value === "object") {
    try {
      const json = JSON.stringify(value);
      const preview = Array.isArray(value)
        ? `[${value.length}]`
        : `{${Object.keys(value).length}}`;
      return (
        <details className="cursor-pointer">
          <summary className="font-mono text-muted-foreground hover:text-foreground">
            {preview}
          </summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[10px] leading-relaxed">
            {JSON.stringify(value, null, 2)}
          </pre>
        </details>
      );
    } catch {}
  }

  if (s.length > 120) {
    return (
      <span className="cursor-help font-mono" title={s}>
        {s.slice(0, 120)}
        <span className="text-muted-foreground">...</span>
      </span>
    );
  }

  return <span className="font-mono">{s}</span>;
}
