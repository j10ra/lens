import { useState, useEffect, createContext, useContext } from "react";
import {
  createFileRoute,
  Outlet,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

interface AuthContext {
  userId: string;
  email: string;
}

const AuthCtx = createContext<AuthContext | null>(null);

export function useAuth(): AuthContext {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within DashboardLayout");
  return ctx;
}

const sidebarItems = [
  { label: "Overview", href: "/dashboard" },
  { label: "API Keys", href: "/dashboard/keys" },
  { label: "Usage", href: "/dashboard/usage" },
  { label: "Billing", href: "/dashboard/billing" },
];

function DashboardLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) navigate({ to: "/login" });
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400">Redirecting to login...</p>
          <a href="/login" className="mt-2 inline-block text-sm text-blue-400 hover:text-blue-300">
            Click here if not redirected
          </a>
        </div>
      </div>
    );
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  const authValue: AuthContext = {
    userId: session.user.id,
    email: session.user.email ?? "",
  };

  return (
    <AuthCtx.Provider value={authValue}>
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="fixed left-0 top-0 flex h-full w-56 flex-col border-r border-zinc-800 bg-zinc-950">
          <div className="flex h-16 items-center px-6">
            <Link to="/" className="text-xl font-bold tracking-tight">
              <span className="text-blue-500">LENS</span>
            </Link>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {sidebarItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="block rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                activeProps={{
                  className:
                    "block rounded-lg px-3 py-2 text-sm bg-zinc-800 text-zinc-100",
                }}
                activeOptions={{ exact: true }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-zinc-800 p-4">
            <div className="truncate text-sm text-zinc-400">
              {authValue.email}
            </div>
            <button
              onClick={handleSignOut}
              className="mt-2 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
            >
              Sign out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="ml-56 flex-1">
          <header className="sticky top-0 z-10 flex h-16 items-center border-b border-zinc-800 bg-zinc-950/80 px-8 backdrop-blur-md">
            <h1 className="text-sm font-medium text-zinc-300">Dashboard</h1>
          </header>
          <main className="p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </AuthCtx.Provider>
  );
}
