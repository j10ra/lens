import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { NavLink, useLocation } from "react-router-dom";
import {
  Activity,
  Cpu,
  Database,
  FolderGit2,
  LayoutDashboard,
  Send,
} from "lucide-react";
import { api } from "@/lib/api";
import { NavUser } from "./NavUser";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV_MAIN = [
  { to: "/", icon: LayoutDashboard, label: "Overview" },
  { to: "/repos", icon: FolderGit2, label: "Repos" },
  { to: "/requests", icon: Activity, label: "Requests" },
  { to: "/data", icon: Database, label: "Data" },
  { to: "/jobs", icon: Cpu, label: "Jobs" },
  { to: "/context", icon: Send, label: "Context" },
] as const;

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();

  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });

  const isHealthy = health.data?.status === "ok";

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <div
                className={`!size-5 shrink-0 rounded-full ${isHealthy ? "bg-success" : "bg-destructive"}`}
              />
              <span className="text-base font-semibold">LENS</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_MAIN.map(({ to, icon: Icon, label }) => {
                const isActive =
                  to === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(to);
                return (
                  <SidebarMenuItem key={to}>
                    <NavLink to={to} end={to === "/"} tabIndex={-1}>
                      <SidebarMenuButton isActive={isActive}>
                        <Icon />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </NavLink>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{ name: "Guest", email: "local" }} />
      </SidebarFooter>
    </Sidebar>
  );
}
