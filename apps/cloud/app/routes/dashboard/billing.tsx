import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@lens/ui";
import { DataTable } from "@/components/DataTable";
import { adminGetAllSubscriptions, adminGetUsers } from "@/lib/server-fns";

export const Route = createFileRoute("/dashboard/billing")({
  component: AdminSubscriptionsPage,
});

type SubRow = Record<string, unknown>;

const fmtDate = (d: unknown) =>
  d ? new Date(d as string).toLocaleDateString("en-CA") : "—";

function AdminSubscriptionsPage() {
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminGetAllSubscriptions().catch(() => []),
      adminGetUsers().catch(() => ({ users: [] })),
    ]).then(([allSubs, users]) => {
      setSubs(allSubs as SubRow[]);
      const map: Record<string, string> = {};
      for (const u of users.users) map[u.id] = u.email;
      setUserMap(map);
      setLoading(false);
    });
  }, []);

  const proCount = subs.filter((s) => s.plan === "pro" && s.status === "active").length;

  const columns = [
    {
      key: "userId",
      label: "User",
      render: (r: SubRow) => (
        <span className="text-muted-foreground">
          {userMap[r.userId as string] ?? (r.userId as string).slice(0, 8)}
        </span>
      ),
    },
    { key: "plan", label: "Plan", render: (r: SubRow) => <span className="font-medium capitalize">{r.plan as string}</span> },
    {
      key: "status",
      label: "Status",
      render: (r: SubRow) =>
        r.status === "active" ? (
          <span className="inline-block rounded px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 font-medium">active</span>
        ) : (
          <span className="inline-block rounded px-1.5 py-0.5 bg-muted text-muted-foreground font-medium">{r.status as string}</span>
        ),
    },
    { key: "currentPeriodEnd", label: "Period End", render: (r: SubRow) => <span className="text-muted-foreground">{fmtDate(r.currentPeriodEnd)}</span> },
    { key: "cancelAtPeriodEnd", label: "Cancel?", render: (r: SubRow) => <span className="text-muted-foreground">{r.cancelAtPeriodEnd ? "Yes" : "No"}</span> },
  ];

  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium">Billing</span>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span>{subs.length} total</span>
          <span>{proCount} active Pro</span>
        </div>
      </PageHeader>
      <div className="flex flex-col flex-1 min-h-0">
        {loading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={columns}
            rows={subs}
            emptyMessage="No subscriptions found"
          />
        )}
      </div>
    </>
  );
}

function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
