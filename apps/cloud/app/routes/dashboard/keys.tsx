import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { adminGetAllKeys, adminGetUsers } from "@/lib/server-fns";

export const Route = createFileRoute("/dashboard/keys")({
  component: AdminKeysPage,
});

function AdminKeysPage() {
  const [keys, setKeys] = useState<Array<Record<string, unknown>>>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminGetAllKeys().catch(() => []),
      adminGetUsers().catch(() => ({ users: [] })),
    ]).then(([allKeys, users]) => {
      setKeys(allKeys as Array<Record<string, unknown>>);
      const map: Record<string, string> = {};
      for (const u of users.users) map[u.id] = u.email;
      setUserMap(map);
      setLoading(false);
    });
  }, []);

  const fmtDate = (d: unknown) =>
    d ? new Date(d as string).toLocaleDateString("en-CA") : null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">API Keys</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          All API keys across all users ({keys.length} total).
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted">
              <th className="px-4 py-3 text-left font-medium">User</th>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Prefix</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
              <th className="px-4 py-3 text-left font-medium">Last Used</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : keys.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No API keys found.</td></tr>
            ) : (
              keys.map((key) => (
                <tr key={key.id as string} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 text-muted-foreground">{userMap[key.userId as string] ?? (key.userId as string).slice(0, 8)}</td>
                  <td className="px-4 py-3 font-medium">{(key.name as string) ?? "Unnamed"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{key.keyPrefix as string}...</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(key.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(key.lastUsedAt) ?? "Never"}</td>
                  <td className="px-4 py-3">
                    {key.revokedAt ? (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Revoked</span>
                    ) : (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">Active</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
