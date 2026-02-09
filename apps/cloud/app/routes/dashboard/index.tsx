import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "../dashboard";
import { getUsageCurrent, getSubscription } from "@/lib/server-fns";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardOverview,
});

interface OverviewData {
  plan: string;
  contextQueries: number;
  embeddingRequests: number;
  reposIndexed: number;
}

const quickLinks = [
  { label: "Manage API Keys", href: "/dashboard/keys" },
  { label: "View Usage", href: "/dashboard/usage" },
  { label: "Billing & Plan", href: "/dashboard/billing" },
  { label: "Documentation", href: "/docs" },
];

function DashboardOverview() {
  const { userId } = useAuth();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [usage, sub] = await Promise.all([
        getUsageCurrent({ data: { userId } }),
        getSubscription({ data: { userId } }),
      ]);
      setData({
        plan: sub?.plan ?? "free",
        contextQueries: usage.usage.contextQueries,
        embeddingRequests: usage.usage.embeddingRequests,
        reposIndexed: usage.usage.reposIndexed,
      });
      setLoading(false);
    })();
  }, [userId]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const stats = [
    {
      label: "Context Queries",
      value: data.contextQueries.toLocaleString(),
      period: "this month",
    },
    {
      label: "Embeddings Generated",
      value: data.embeddingRequests.toLocaleString(),
      period: "this month",
    },
    {
      label: "Repos Indexed",
      value: data.reposIndexed.toLocaleString(),
      period: "total",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Here's an overview of your LENS usage.
        </p>
      </div>

      {/* Plan badge */}
      <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5">
        <span className="text-sm font-medium capitalize text-blue-400">
          {data.plan} Plan
        </span>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-6"
          >
            <p className="text-sm text-zinc-400">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold">{stat.value}</p>
            <p className="mt-1 text-xs text-zinc-500">{stat.period}</p>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div>
        <h3 className="mb-4 text-sm font-semibold text-zinc-300">
          Quick Links
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800"
            >
              {link.label}
              <svg
                className="h-4 w-4 text-zinc-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
