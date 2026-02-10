import {
  LayoutDashboard,
  Key,
  BarChart3,
  CreditCard,
  Users,
  Activity,
} from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AppSidebar, NavUser, type NavItem } from "@lens/ui";
import { useAuth } from "@/lib/auth-context";

const NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: "Overview", href: "/dashboard" },
  { icon: Users, label: "Users", href: "/dashboard/users" },
  { icon: Key, label: "API Keys", href: "/dashboard/keys" },
  { icon: BarChart3, label: "Usage", href: "/dashboard/usage" },
  { icon: CreditCard, label: "Billing", href: "/dashboard/billing" },
  { icon: Activity, label: "Telemetry", href: "/dashboard/telemetry" },
];

export function CloudSidebar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { email, onSignOut } = useAuth();

  return (
    <AppSidebar
      navItems={NAV_ITEMS}
      currentPath={currentPath}
      renderLink={({ href, children }) => <Link to={href}>{children}</Link>}
      brand={{ title: "LENS", subtitle: "Admin" }}
      footer={<NavUser user={{ name: email, email }} onSignOut={onSignOut} />}
    />
  );
}
