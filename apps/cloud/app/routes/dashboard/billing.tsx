import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { adminGetAllSubscriptions, adminGetUsers } from "@/lib/server-fns";

export const Route = createFileRoute("/dashboard/billing")({
  component: AdminSubscriptionsPage,
});

function AdminSubscriptionsPage() {
  const [subs, setSubs] = useState<Array<Record<string, unknown>>>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminGetAllSubscriptions().catch(() => []),
      adminGetUsers().catch(() => ({ users: [] })),
    ]).then(([allSubs, users]) => {
      setSubs(allSubs as Array<Record<string, unknown>>);
      const map: Record<string, string> = {};
      for (const u of users.users) map[u.id] = u.email;
      setUserMap(map);
      setLoading(false);
    });
  }, []);

  const fmtDate = (d: unknown) =>
    d ? new Date(d as string).toLocaleDateString("en-CA") : "—";

  const proCount = subs.filter((s) => s.plan === "pro" && s.status === "active").length;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Subscriptions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {subs.length} total, {proCount} active Pro.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted">
              <th className="px-4 py-3 text-left font-medium">User</th>
              <th className="px-4 py-3 text-left font-medium">Plan</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Period End</th>
              <th className="px-4 py-3 text-left font-medium">Cancel?</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : subs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No subscriptions found.</td></tr>
            ) : (
              subs.map((sub) => (
                <tr key={sub.id as string} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 text-muted-foreground">
                    {userMap[sub.userId as string] ?? (sub.userId as string).slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 font-medium capitalize">{sub.plan as string}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      sub.status === "active"
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {(sub.status as string)?.charAt(0).toUpperCase() + (sub.status as string)?.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(sub.currentPeriodEnd)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{sub.cancelAtPeriodEnd ? "Yes" : "No"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
