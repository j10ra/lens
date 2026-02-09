import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { NavLink, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
	Activity,
	Cpu,
	Database,
	FolderGit2,
	LayoutDashboard,
	Send,
	Sun,
	Moon,
} from "lucide-react";
import { api } from "@/lib/api";
import { NavUser } from "./NavUser";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
} from "@/components/ui/sidebar";

const NAV_MAIN = [
	{ to: "/", icon: LayoutDashboard, label: "Overview" },
	{ to: "/repos", icon: FolderGit2, label: "Repos" },
	{ to: "/requests", icon: Activity, label: "Requests" },
	{ to: "/data", icon: Database, label: "Data" },
	{ to: "/jobs", icon: Cpu, label: "Jobs" },
	{ to: "/context", icon: Send, label: "Context" },
] as const;

function ModeToggle() {
	const [dark, setDark] = useState(() => {
		if (typeof window === "undefined") return false;
		const stored = localStorage.getItem("theme");
		if (stored === "dark") return true;
		if (stored === "light") return false;
		return document.documentElement.classList.contains("dark");
	});

	useEffect(() => {
		document.documentElement.classList.toggle("dark", dark);
		localStorage.setItem("theme", dark ? "dark" : "light");
	}, [dark]);

	return (
		<SidebarMenuButton onClick={() => setDark((d) => !d)}>
			{dark ? <Sun /> : <Moon />}
			<span>{dark ? "Light mode" : "Dark mode"}</span>
		</SidebarMenuButton>
	);
}

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
		<Sidebar collapsible="icon" className="shadow-none" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" className="hover:bg-transparent">
							<div
								className={`flex size-8! shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-primary-foreground ${isHealthy ? "bg-primary" : "bg-destructive"}`}
							>
								L
							</div>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-semibold">LENS</span>
								<span className="truncate text-xs text-muted-foreground">
									Workspace
								</span>
							</div>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
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

				<SidebarSeparator />

				<SidebarGroup className="mt-auto">
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<ModeToggle />
							</SidebarMenuItem>
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
