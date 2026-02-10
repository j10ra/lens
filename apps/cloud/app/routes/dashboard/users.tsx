import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@lens/ui";
import { DataTable } from "@/components/DataTable";
import { adminGetUsers } from "@/lib/server-fns";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/dashboard/users")({
  component: UsersPage,
});

interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-CA") : "Never";

const columns = [
  { key: "email", label: "Email", render: (r: User) => <span className="font-medium">{r.email}</span> },
  {
    key: "id",
    label: "User ID",
    render: (r: User) => <span className="text-muted-foreground">{r.id.slice(0, 8)}...</span>,
  },
  { key: "created_at", label: "Signed Up", render: (r: User) => <span className="text-muted-foreground">{fmtDate(r.created_at)}</span> },
  { key: "last_sign_in_at", label: "Last Sign In", render: (r: User) => <span className="text-muted-foreground">{fmtDate(r.last_sign_in_at)}</span> },
];

function UsersPage() {
  const { accessToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    adminGetUsers({ data: { accessToken } })
      .then((data) => setUsers(data.users))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken]);

  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium">Users</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {users.length} registered user{users.length !== 1 ? "s" : ""}
        </span>
      </PageHeader>
      <div className="flex flex-col flex-1 min-h-0">
        {loading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={columns}
            rows={users as Array<Record<string, unknown>>}
            emptyMessage="No users found"
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
