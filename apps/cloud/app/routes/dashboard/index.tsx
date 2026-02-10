import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import {
  adminGetUsers,
  adminGetGlobalUsage,
  adminGetAllSubscriptions,
} from "@/lib/server-fns";

export const Route = createFileRoute("/dashboard/")({
  component: AdminOverview,
});

const quickLinks = [
  { label: "Manage Users", href: "/dashboard/users" },
  { label: "View API Keys", href: "/dashboard/keys" },
  { label: "Usage Analytics", href: "/dashboard/usage" },
  { label: "Subscriptions", href: "/dashboard/billing" },
];

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

  const stats = [
    { label: "Total Users", value: totalUsers.toLocaleString() },
    { label: "Pro Subscribers", value: proSubscribers.toLocaleString() },
    { label: "Context Queries", value: usage.contextQueries.toLocaleString(), period: "this month" },
    { label: "Embeddings", value: usage.embeddingRequests.toLocaleString(), period: "this month" },
    { label: "Summaries", value: usage.purposeRequests.toLocaleString(), period: "this month" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Admin Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">Global platform statistics.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border bg-card p-6">
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold text-card-foreground">{stat.value}</p>
            {stat.period && <p className="mt-1 text-xs text-muted-foreground/70">{stat.period}</p>}
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-4 text-sm font-semibold text-foreground">Quick Links</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground transition-colors hover:bg-accent"
            >
              {link.label}
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
