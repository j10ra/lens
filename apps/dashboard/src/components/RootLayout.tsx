import { AppSidebar, type NavItem, SidebarInset, SidebarProvider } from "@lens/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Activity, FolderGit2, LayoutDashboard } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router";
import { api } from "../lib/api.js";

const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: LayoutDashboard, label: "Overview" },
  { href: "/repos", icon: FolderGit2, label: "Repos" },
  { href: "/traces", icon: Activity, label: "Traces" },
];

export function RootLayout() {
  const location = useLocation();

  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });

  const isHealthy = health.data?.status === "ok";

  return (
    <SidebarProvider className="bg-muted h-svh">
      <AppSidebar
        navItems={NAV_ITEMS}
        currentPath={location.pathname}
        renderLink={({ href, className, children }) => (
          <Link to={href} className={className}>
            {children}
          </Link>
        )}
        healthy={isHealthy}
      />
      <SidebarInset className="bg-background rounded-xl overflow-hidden md:my-2 md:mr-2 md:border">
        <div className="@container/main flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
