import { Button, cn, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lens/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Column<T> {
  key: string;
  label: React.ReactNode;
  className?: string;
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
  title?: string;
  description?: string;
  toolbar?: React.ReactNode;
  className?: string;
  tableClassName?: string;
  headerClassName?: string;
  rowKey?: (row: T, index: number) => string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  total = rows.length,
  page = 0,
  pageSize = 50,
  onPageChange,
  emptyMessage = "No data",
  title,
  description,
  toolbar,
  className,
  tableClassName,
  headerClassName,
  rowKey,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      {(title || description || toolbar) && (
        <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h3 className="text-sm font-semibold">{title}</h3>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
        </div>
      )}

      <Table className={cn("min-w-full", tableClassName)}>
        <TableHeader className={cn("sticky top-0 z-10 bg-background", headerClassName)}>
          <TableRow className="hover:bg-muted/40">
            {columns.map((col) => (
              <TableHead key={col.key} className={cn("text-xs font-medium text-muted-foreground", col.className)}>
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, i) => (
              <TableRow key={rowKey ? rowKey(row, i) : JSON.stringify(row)} className="odd:bg-muted/20">
                {columns.map((col) => (
                  <TableCell key={col.key} className={cn("text-xs", col.className)}>
                    {col.render ? col.render(row) : renderCell(row[col.key])}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {total > pageSize && onPageChange && (
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
          <span>
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-xs" onClick={() => onPageChange(page - 1)} disabled={page === 0}>
              <ChevronLeft />
            </Button>
            <span className="px-2">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function renderCell(value: unknown): React.ReactNode {
  if (value == null) return <span className="text-muted-foreground/50">null</span>;
  if (typeof value === "object") {
    return <pre className="max-w-xs truncate text-xs font-mono text-muted-foreground">{JSON.stringify(value)}</pre>;
  }
  return String(value);
}
