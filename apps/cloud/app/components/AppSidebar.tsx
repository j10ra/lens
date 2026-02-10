import {
  LayoutDashboard,
  Key,
  BarChart3,
  CreditCard,
  Users,
} from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  AppSidebar,
  NavUser,
  type NavItem,
} from "@lens/ui";
import { useAuth } from "@/routes/dashboard";

const NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: "Overview", href: "/dashboard" },
  { icon: Users, label: "Users", href: "/dashboard/users" },
  { icon: Key, label: "API Keys", href: "/dashboard/keys" },
  { icon: BarChart3, label: "Usage", href: "/dashboard/usage" },
  { icon: CreditCard, label: "Subscriptions", href: "/dashboard/billing" },
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
