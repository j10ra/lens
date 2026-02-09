import { useState, useEffect, createContext, useContext } from "react";
import {
  createFileRoute,
  Outlet,
  Link,
  useNavigate,
  useMatches,
} from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  Key,
  BarChart3,
  CreditCard,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";

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
  if (!ctx) return { userId: "", email: "" };
  return ctx;
}

const NAV = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "API Keys", href: "/dashboard/keys", icon: Key },
  { label: "Usage", href: "/dashboard/usage", icon: BarChart3 },
  { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
];

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/keys": "API Keys",
  "/dashboard/usage": "Usage",
  "/dashboard/billing": "Billing",
};

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function DashboardLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const matches = useMatches();
  const currentPath = matches[matches.length - 1]?.fullPath ?? "/dashboard";
  const pageTitle = ROUTE_TITLES[currentPath] ?? "Dashboard";

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
    ? { userId: session.user.id, email: session.user.email ?? "" }
    : { userId: "", email: "" };

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
      <div className="flex h-screen bg-muted">
        {/* Sidebar */}
        <aside className="flex w-56 shrink-0 flex-col bg-sidebar border-r border-sidebar-border">
          {/* Logo */}
          <div className="flex h-14 items-center gap-2 px-4">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
              L
            </div>
            <div className="grid text-left text-sm leading-tight">
              <span className="font-semibold text-sidebar-foreground">LENS</span>
              <span className="text-xs text-muted-foreground">Cloud</span>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-1 px-2 py-4">
            {NAV.map(({ label, href, icon: Icon }) => {
              const active = currentPath === href;
              return (
                <Link
                  key={href}
                  to={href}
                  activeOptions={{ exact: true }}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-sidebar-border p-4">
            <div className="truncate text-sm text-sidebar-foreground">
              {authValue.email}
            </div>
            <button
              onClick={handleSignOut}
              className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <LogOut className="size-3" />
              Sign out
            </button>
          </div>
        </aside>

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl bg-background md:my-2 md:mr-2 md:border">
          {/* Header */}
          <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
            <h1 className="text-sm font-semibold">{pageTitle}</h1>
            <div className="ml-auto flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-success" />
                Cloud
              </div>
              <ThemeToggle />
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-auto p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </AuthCtx.Provider>
  );
}
