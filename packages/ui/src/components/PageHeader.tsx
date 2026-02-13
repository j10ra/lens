import { Separator } from "./ui/separator";
import { SidebarTrigger } from "./ui/sidebar";

export function PageHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex w-full items-center gap-2 px-3">
        <SidebarTrigger />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
        <div className="flex flex-1 items-center gap-2 min-w-0">{children}</div>
      </div>
    </header>
  );
}
