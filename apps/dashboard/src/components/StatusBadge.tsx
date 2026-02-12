import { Badge, cn } from "@lens/ui";

const VARIANTS: Record<string, string> = {
  ready: "bg-success/15 text-success border-success/25",
  indexed: "bg-success/15 text-success border-success/25",
  indexing: "bg-warning/15 text-warning border-warning/25",
  pending: "bg-muted text-muted-foreground border-border",
  error: "bg-destructive/15 text-destructive border-destructive/25",
  active: "bg-success/15 text-success border-success/25",
  inactive: "bg-muted text-muted-foreground border-border",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const isIndexing = status === "indexing";
  const variant = VARIANTS[status] ?? VARIANTS.pending;
  return (
    <Badge
      variant="outline"
      className={cn("rounded-md px-2 py-0.5 text-[11px] tabular-nums", variant, className)}
    >
      {isIndexing && <span className="mr-1 inline-block h-2 w-2 animate-spin rounded-full border border-current border-t-transparent" />}
      {status}
    </Badge>
  );
}
