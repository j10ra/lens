import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { adminGetUsers } from "@/lib/server-fns";

export const Route = createFileRoute("/dashboard/users")({
  component: UsersPage,
});

interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
}

function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGetUsers()
      .then((data) => setUsers(data.users))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-CA") : "Never";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Users</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {users.length} registered user{users.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted">
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">User ID</th>
              <th className="px-4 py-3 text-left font-medium">Signed Up</th>
              <th className="px-4 py-3 text-left font-medium">Last Sign In</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No users found.</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 font-medium">{u.email}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{u.id.slice(0, 8)}...</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(u.created_at)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(u.last_sign_in_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
