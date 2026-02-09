import { useState, useEffect, createContext, useContext } from "react";
import {
  createFileRoute,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
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

interface AuthContext {
  userId: string;
  email: string;
  onSignOut: () => void;
}

const AuthCtx = createContext<AuthContext | null>(null);

export function useAuth(): AuthContext {
  const ctx = useContext(AuthCtx);
  if (!ctx) return { userId: "", email: "", onSignOut: () => {} };
  return ctx;
}

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/keys": "API Keys",
  "/dashboard/usage": "Usage",
  "/dashboard/billing": "Billing",
};

function DashboardLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  const authValue: AuthContext = session
    ? { userId: session.user.id, email: session.user.email ?? "", onSignOut: handleSignOut }
    : { userId: "", email: "", onSignOut: handleSignOut };

  if (loading) {
    return (
      <AuthCtx.Provider value={authValue}>
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AuthCtx.Provider>
    );
  }

  return (
    <AuthCtx.Provider value={authValue}>
      <SidebarProvider className="bg-muted h-svh">
        <CloudSidebar />
        <SidebarInset className="bg-background rounded-xl overflow-hidden md:my-2 md:mr-2 md:border">
          <PageHeader>
            <h1 className="text-sm font-semibold">
              {ROUTE_TITLES[location.pathname] ?? "Dashboard"}
            </h1>
            <div className="ml-auto flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-success" />
                Cloud
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
