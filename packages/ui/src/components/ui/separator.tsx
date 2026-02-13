import type * as React from "react";
import { cn } from "../../lib/utils";

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: Omit<React.ComponentProps<"hr">, "children"> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <hr
      data-slot="separator"
      data-orientation={orientation}
      className={cn(
        "bg-border shrink-0 border-none",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
