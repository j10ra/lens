import { AppSidebar, type NavGroup, type NavItem, NavUser, SidebarInset, SidebarProvider } from "@lens/ui";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Activity, BarChart3, CreditCard, Database, FolderGit2, LayoutDashboard, Send } from "lucide-react";
import { useEffect } from "react";
import { api } from "@/lib/api";

const PRIMARY_ACTION: NavItem = { href: "/context", icon: Send, label: "Context" };

const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: LayoutDashboard, label: "Overview" },
  { href: "/repos", icon: FolderGit2, label: "Repos" },
  { href: "/requests", icon: Activity, label: "Requests" },
  { href: "/data", icon: Database, label: "Data" },
];

const CLOUD_GROUPS: NavGroup[] = [
  {
    label: "Cloud",
    items: [
      { href: "/usage", icon: BarChart3, label: "Usage" },
      { href: "/billing", icon: CreditCard, label: "Billing" },
    ],
  },
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
  const cloudUrl = health.data?.cloud_url ?? "";
  const connectionLabel = cloudUrl && !/localhost|127\.0\.0\.1/.test(cloudUrl) ? "Cloud" : "Local";

  const qc = useQueryClient();
  const auth = useQuery({
    queryKey: ["auth-status"],
    queryFn: api.authStatus,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const es = new EventSource("/api/events");
    let repoTimer: ReturnType<typeof setTimeout>;
    es.onmessage = (e) => {
      try {
        const { type } = JSON.parse(e.data) as { type: string };
        if (type === "auth") {
          qc.invalidateQueries({ queryKey: ["auth-status"] });
          qc.invalidateQueries({ queryKey: ["dashboard-usage"] });
          qc.invalidateQueries({ queryKey: ["cloud-subscription"] });
        } else if (type === "repo") {
          clearTimeout(repoTimer);
          repoTimer = setTimeout(() => {
            qc.invalidateQueries({ queryKey: ["dashboard-repos"] });
            qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
          }, 300);
        }
      } catch {}
    };
    return () => {
      clearTimeout(repoTimer);
      es.close();
    };
  }, [qc]);

  const user = auth.data?.authenticated
    ? { name: auth.data.email ?? "User", email: auth.data.email ?? "" }
    : { name: "Guest", email: "Run: lens login" };

  return (
    <SidebarProvider className="bg-muted h-svh">
      <AppSidebar
        primaryAction={PRIMARY_ACTION}
        navItems={NAV_ITEMS}
        navGroups={CLOUD_GROUPS}
        currentPath={currentPath}
        renderLink={({ href, children }) => <Link to={href}>{children}</Link>}
        healthy={isHealthy}
        connectionLabel={connectionLabel}
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
