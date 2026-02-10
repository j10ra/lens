import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { adminGetGlobalUsage, adminGetUsers } from "@/lib/server-fns";

export const Route = createFileRoute("/dashboard/usage")({
  component: AdminUsagePage,
});

interface GlobalUsage {
  totalUsers: number;
  contextQueries: number;
  embeddingRequests: number;
  embeddingChunks: number;
  purposeRequests: number;
  reposIndexed: number;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold text-card-foreground">{value}</p>
    </div>
  );
}

function AdminUsagePage() {
  const [data, setData] = useState<GlobalUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10);

    Promise.all([
      adminGetGlobalUsage({ data: { periodStart } }).catch(() => null),
      adminGetUsers().catch(() => ({ users: [] })),
    ]).then(([usage, _users]) => {
      setData({
        totalUsers: usage?.totalUsers ?? 0,
        contextQueries: usage?.contextQueries ?? 0,
        embeddingRequests: usage?.embeddingRequests ?? 0,
        embeddingChunks: usage?.embeddingChunks ?? 0,
        purposeRequests: usage?.purposeRequests ?? 0,
        reposIndexed: usage?.reposIndexed ?? 0,
      });
      setLoading(false);
    });
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Usage</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Global usage for current billing period ({data.totalUsers} active user{data.totalUsers !== 1 ? "s" : ""}).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Context Queries" value={data.contextQueries.toLocaleString()} />
        <StatCard label="Embedding Requests" value={data.embeddingRequests.toLocaleString()} />
        <StatCard label="Embedding Chunks" value={data.embeddingChunks.toLocaleString()} />
        <StatCard label="Purpose Summaries" value={data.purposeRequests.toLocaleString()} />
        <StatCard label="Repos Indexed" value={data.reposIndexed.toLocaleString()} />
      </div>
    </div>
  );
}
