import type { LucideIcon } from "lucide-react";
import { ArrowRight, Cloud, Monitor } from "lucide-react";
import { Logo } from "./Logo";
import { ModeToggle } from "./ModeToggle";
import { Badge } from "./ui/badge";
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
  primaryAction?: NavItem;
  currentPath: string;
  renderLink: (props: {
    href: string;
    className?: string;
    children: React.ReactNode;
  }) => React.ReactNode;
  brand?: { title: string; subtitle: string };
  healthy?: boolean;
  connectionLabel?: string;
  footer?: React.ReactNode;
}

export function AppSidebar({
  navItems,
  navGroups,
  primaryAction,
  currentPath,
  renderLink,
  brand = { title: "LENS", subtitle: "Workspace" },
  healthy,
  connectionLabel,
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
        {primaryAction && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem className="flex flex-row items-center gap-1.5">
                  <div className="flex-1 min-w-0">
                    {renderLink({
                      href: primaryAction.href,
                      children: (
                        <SidebarMenuButton
                          className="border border-border bg-muted/40 hover:bg-muted h-9 font-medium"
                        >
                          <primaryAction.icon />
                          <span>{primaryAction.label}</span>
                        </SidebarMenuButton>
                      ),
                    })}
                  </div>
                  <div className="shrink-0 group-data-[collapsible=icon]:hidden">
                    {renderLink({
                      href: primaryAction.href,
                      children: (
                        <button className="flex size-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted transition-colors">
                          <ArrowRight className="size-4 text-muted-foreground" />
                        </button>
                      ),
                    })}
                  </div>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

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

        <SidebarGroup className="mt-auto group-data-[collapsible=icon]:hidden">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <div className="flex items-center justify-between px-2 py-1">
                  {connectionLabel && (
                    <Badge variant="outline">
                      {connectionLabel === "Cloud" ? <Cloud /> : <Monitor />}
                      {connectionLabel}
                    </Badge>
                  )}
                  <ModeToggle variant="button" />
                </div>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {footer && <SidebarFooter>{footer}</SidebarFooter>}
    </Sidebar>
  );
}
