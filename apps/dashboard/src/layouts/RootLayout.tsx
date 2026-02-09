import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Cpu,
  Database,
  FolderGit2,
  LayoutDashboard,
  Send,
} from "lucide-react";
import {
  AppSidebar,
  NavUser,
  SidebarInset,
  SidebarProvider,
  type NavItem,
} from "@lens/ui";
import { api } from "@/lib/api";

const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: LayoutDashboard, label: "Overview" },
  { href: "/repos", icon: FolderGit2, label: "Repos" },
  { href: "/requests", icon: Activity, label: "Requests" },
  { href: "/data", icon: Database, label: "Data" },
  { href: "/jobs", icon: Cpu, label: "Jobs" },
  { href: "/context", icon: Send, label: "Context" },
];

export function RootLayout() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });

  const isHealthy = health.data?.status === "ok";

  const qc = useQueryClient();
  const auth = useQuery({
    queryKey: ["auth-status"],
    queryFn: api.authStatus,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const es = new EventSource("/api/auth/events");
    es.onmessage = () => qc.invalidateQueries({ queryKey: ["auth-status"] });
    return () => es.close();
  }, [qc]);

  const user = auth.data?.authenticated
    ? { name: auth.data.email ?? "User", email: auth.data.email ?? "" }
    : { name: "Guest", email: "Run: lens login" };

  return (
    <SidebarProvider className="bg-muted h-svh">
      <AppSidebar
        navItems={NAV_ITEMS}
        currentPath={currentPath}
        renderLink={({ href, children }) => (
          <Link to={href}>{children}</Link>
        )}
        healthy={isHealthy}
        footer={<NavUser user={user} />}
      />
      <SidebarInset className="bg-background rounded-xl overflow-hidden md:my-2 md:mr-2 md:border">
        <div className="@container/main flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
