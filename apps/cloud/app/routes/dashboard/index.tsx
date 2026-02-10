import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Users,
  Key,
  BarChart3,
  CreditCard,
  Activity,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@lens/ui";
import {
  adminGetUsers,
  adminGetGlobalUsage,
  adminGetAllSubscriptions,
} from "@/lib/server-fns";

export const Route = createFileRoute("/dashboard/")({
  component: AdminOverview,
});

const quickLinks = [
  { icon: Users, label: "Manage Users", href: "/dashboard/users" },
  { icon: Key, label: "View API Keys", href: "/dashboard/keys" },
  { icon: BarChart3, label: "Usage Analytics", href: "/dashboard/usage" },
  { icon: CreditCard, label: "Subscriptions", href: "/dashboard/billing" },
  { icon: Activity, label: "Telemetry", href: "/dashboard/telemetry" },
];

type StatCardItem = {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
};

const ic = "border-border/80 bg-muted/35 text-foreground/80";

function AdminOverview() {
  const [totalUsers, setTotalUsers] = useState(0);
  const [proSubscribers, setProSubscribers] = useState(0);
  const [usage, setUsage] = useState({ contextQueries: 0, embeddingRequests: 0, purposeRequests: 0 });

  useEffect(() => {
    const periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10);

    adminGetUsers()
      .then((r) => setTotalUsers(r?.users?.length ?? 0))
      .catch(() => {});

    adminGetGlobalUsage({ data: { periodStart } })
      .then((r) => {
        if (r) setUsage({
          contextQueries: r.contextQueries ?? 0,
          embeddingRequests: r.embeddingRequests ?? 0,
          purposeRequests: r.purposeRequests ?? 0,
        });
      })
      .catch(() => {});

    adminGetAllSubscriptions()
      .then((r) => {
        if (Array.isArray(r)) setProSubscribers(r.filter((s) => s.plan === "pro" && s.status === "active").length);
      })
      .catch(() => {});
  }, []);

  const stats: StatCardItem[] = [
    { label: "Users", value: totalUsers.toLocaleString(), description: "Registered accounts", icon: Users },
    { label: "Pro", value: proSubscribers.toLocaleString(), description: "Active Pro subscribers", icon: CreditCard },
    { label: "Context", value: usage.contextQueries.toLocaleString(), description: "Queries this month", icon: BarChart3 },
    { label: "Embeddings", value: usage.embeddingRequests.toLocaleString(), description: "Requests this month", icon: BarChart3 },
    { label: "Summaries", value: usage.purposeRequests.toLocaleString(), description: "Generated this month", icon: BarChart3 },
  ];

  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium">Overview</span>
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto py-4 md:gap-6 md:py-6">
        <section className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @3xl/main:grid-cols-4">
          {stats.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label} className="border-border bg-background py-4 shadow-none">
                <CardHeader className="pb-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
                      <CardTitle className="mt-1 text-2xl font-semibold tabular-nums">
                        {card.value}
                      </CardTitle>
                    </div>
                    <span className={`rounded-md border p-1.5 ${ic}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">{card.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="space-y-3 px-4 lg:px-6">
          <h2 className="text-sm font-semibold">Quick Links</h2>
          <div className="grid gap-3 @xl/main:grid-cols-2 @3xl/main:grid-cols-3">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground transition-colors hover:bg-accent"
              >
                <div className="flex items-center gap-2">
                  <link.icon className="size-4 text-muted-foreground" />
                  {link.label}
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
