import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  CreditCard,
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
  type NavGroup,
} from "@lens/ui";
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
    const es = new EventSource("/api/auth/events");
    es.onmessage = () => {
      qc.invalidateQueries({ queryKey: ["auth-status"] });
      // Auth changed (login/logout) — refresh daemon's plan cache then re-fetch usage
      api.refreshPlan()
        .then(() => {
          qc.invalidateQueries({ queryKey: ["dashboard-usage"] });
          qc.invalidateQueries({ queryKey: ["cloud-subscription"] });
        })
        .catch(() => {});
    };
    return () => es.close();
  }, [qc]);

  useEffect(() => {
    const es = new EventSource("/api/repo/events");
    let timer: ReturnType<typeof setTimeout>;
    es.onmessage = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["dashboard-repos"] });
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      }, 300);
    };
    return () => { clearTimeout(timer); es.close(); };
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
        renderLink={({ href, children }) => (
          <Link to={href}>{children}</Link>
        )}
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
