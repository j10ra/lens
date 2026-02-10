import { useState, useEffect } from "react";
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { AuthCtx, type AuthContext } from "@/lib/auth-context";
import type { Session } from "@supabase/supabase-js";
import {
  SidebarProvider,
  SidebarInset,
  PageHeader,
  ModeToggle,
} from "@lens/ui";
import { CloudSidebar } from "@/components/AppSidebar";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Admin Overview",
  "/dashboard/users": "Users",
  "/dashboard/keys": "API Keys",
  "/dashboard/usage": "Usage",
  "/dashboard/billing": "Billing",
};

function DashboardLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        navigate({ to: "/login" });
        return;
      }
      if (session) {
        setSession(session);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  async function handleSignOut() {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    window.location.href = "/login";
  }

  const authValue: AuthContext = session
    ? {
        userId: session.user.id,
        email: session.user.email ?? "",
        onSignOut: handleSignOut,
      }
    : { userId: "", email: "", onSignOut: handleSignOut };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAdmin(authValue.email)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <div className="text-4xl font-bold text-destructive">403</div>
        <p className="text-muted-foreground">Admin access only</p>
        <button
          type="button"
          onClick={handleSignOut}
          className="text-sm underline text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <AuthCtx.Provider value={authValue}>
      <SidebarProvider className="bg-muted h-svh">
        <CloudSidebar />
        <SidebarInset className="bg-background rounded-xl overflow-hidden md:my-2 md:mr-2 md:border">
          <PageHeader>
            <h1 className="text-sm font-semibold">
              {ROUTE_TITLES[pathname] ?? "Dashboard"}
            </h1>
            <div className="ml-auto flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-success" />
                Admin
              </div>
              <ModeToggle variant="button" />
            </div>
          </PageHeader>
          <main className="flex-1 overflow-auto p-4 lg:p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </AuthCtx.Provider>
  );
}
