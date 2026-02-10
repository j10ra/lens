import { CircleUser, MoreVertical, LogOut } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar";

export function NavUser({
  user,
  onSignOut,
}: {
  user: { name: string; email: string };
  onSignOut?: () => void;
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton as="div" size="lg">
          <CircleUser className="!size-8 text-muted-foreground" />
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{user.name}</span>
            <span className="text-muted-foreground truncate text-xs">
              {user.email}
            </span>
          </div>
          {onSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              className="ml-auto rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="size-4" />
            </button>
          ) : (
            <MoreVertical className="ml-auto" />
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
