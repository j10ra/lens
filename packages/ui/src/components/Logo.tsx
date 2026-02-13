import { cn } from "../lib/utils";

export function Logo({
  healthy,
  title = "LENS",
  subtitle = "Workspace",
}: {
  healthy?: boolean;
  title?: string;
  subtitle?: string;
}) {
  return (
    <>
      <div
        className={cn(
          "flex size-8! shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-primary-foreground",
          healthy === false ? "bg-destructive" : "bg-primary",
        )}
      >
        L
      </div>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-semibold">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
      </div>
    </>
  );
}
