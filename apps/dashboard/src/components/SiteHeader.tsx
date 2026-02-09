import { useLocation } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Sun, Moon } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/repos": "Repositories",
  "/requests": "Request Log",
  "/data": "Data Browser",
  "/jobs": "Background Jobs",
  "/context": "Context Playground",
};

function ModeToggle() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("theme");
    if (stored === "dark") return true;
    if (stored === "light") return false;
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      onClick={() => setDark((d) => !d)}
    >
      {dark ? <Sun /> : <Moon />}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

export function SiteHeader() {
  const location = useLocation();

  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });

  const isHealthy = health.data?.status === "ok";
  const basePath = "/" + (location.pathname.split("/")[1] ?? "");
  const title = ROUTE_TITLES[basePath] ?? "LENS";

  return (
    <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur transition-[width,height] ease-linear supports-[backdrop-filter]:bg-background/70">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-sm font-semibold">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-2 py-1 text-xs text-muted-foreground">
            <div
              className={`h-2 w-2 rounded-full ${isHealthy ? "bg-success" : "bg-destructive"}`}
            />
            {health.data?.version ?? "..."}
          </div>
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
