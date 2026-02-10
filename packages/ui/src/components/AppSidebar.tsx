import type { LucideIcon } from "lucide-react";
import { Logo } from "./Logo";
import { ModeToggle } from "./ModeToggle";
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
} from "./ui/sidebar";

export interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  navItems: NavItem[];
  navGroups?: NavGroup[];
  currentPath: string;
  renderLink: (props: {
    href: string;
    className?: string;
    children: React.ReactNode;
  }) => React.ReactNode;
  brand?: { title: string; subtitle: string };
  healthy?: boolean;
  footer?: React.ReactNode;
}

export function AppSidebar({
  navItems,
  navGroups,
  currentPath,
  renderLink,
  brand = { title: "LENS", subtitle: "Workspace" },
  healthy,
  footer,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" className="shadow-none" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="hover:bg-transparent">
              <Logo
                healthy={healthy}
                title={brand.title}
                subtitle={brand.subtitle}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ href, icon: Icon, label }) => {
                const isActive =
                  href === "/" || href === "/dashboard"
                    ? currentPath === href
                    : currentPath.startsWith(href);
                return (
                  <SidebarMenuItem key={href}>
                    {renderLink({
                      href,
                      children: (
                        <SidebarMenuButton isActive={isActive}>
                          <Icon />
                          <span>{label}</span>
                        </SidebarMenuButton>
                      ),
                    })}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {navGroups?.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(({ href, icon: Icon, label }) => {
                  const isActive = currentPath.startsWith(href);
                  return (
                    <SidebarMenuItem key={href}>
                      {renderLink({
                        href,
                        children: (
                          <SidebarMenuButton isActive={isActive}>
                            <Icon />
                            <span>{label}</span>
                          </SidebarMenuButton>
                        ),
                      })}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <ModeToggle variant="sidebar" />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {footer && <SidebarFooter>{footer}</SidebarFooter>}
    </Sidebar>
  );
}
