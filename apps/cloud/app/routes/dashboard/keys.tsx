import { useState, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { Button, Checkbox, PageHeader } from "@lens/ui";
import { DataTable } from "@/components/DataTable";
import { adminGetAllKeys, adminGetUsers, adminDeleteKeys } from "@/lib/server-fns";

export const Route = createFileRoute("/dashboard/keys")({
  component: AdminKeysPage,
});

type KeyRow = Record<string, unknown>;

const fmtDate = (d: unknown) =>
  d ? new Date(d as string).toLocaleDateString("en-CA") : null;

function AdminKeysPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      adminGetAllKeys().catch(() => []),
      adminGetUsers().catch(() => ({ users: [] })),
    ]).then(([allKeys, users]) => {
      setKeys(allKeys as KeyRow[]);
      const map: Record<string, string> = {};
      for (const u of users.users) map[u.id] = u.email;
      setUserMap(map);
      setSelected(new Set());
      setLoading(false);
    });
  }, []);

  useEffect(load, [load]);

  const revokedKeys = keys.filter((k) => k.revokedAt);
  const selectedRevoked = [...selected].filter((id) =>
    revokedKeys.some((k) => k.id === id),
  );

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllRevoked() {
    if (selectedRevoked.length === revokedKeys.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(revokedKeys.map((k) => k.id as string)));
    }
  }

  async function handleDelete() {
    if (selectedRevoked.length === 0) return;
    setDeleting(true);
    try {
      await adminDeleteKeys({ data: { ids: selectedRevoked } });
      load();
    } catch {} finally {
      setDeleting(false);
    }
  }

  const columns = [
    {
      key: "userId",
      label: "User",
      render: (r: KeyRow) => (
        <span className="text-muted-foreground">
          {userMap[r.userId as string] ?? (r.userId as string).slice(0, 8)}
        </span>
      ),
    },
    { key: "name", label: "Name", render: (r: KeyRow) => <span className="font-medium">{(r.name as string) ?? "Unnamed"}</span> },
    {
      key: "keyPrefix",
      label: "Prefix",
      render: (r: KeyRow) => <span className="text-muted-foreground">{r.keyPrefix as string}...</span>,
    },
    { key: "createdAt", label: "Created", render: (r: KeyRow) => <span className="text-muted-foreground">{fmtDate(r.createdAt)}</span> },
    { key: "lastUsedAt", label: "Last Used", render: (r: KeyRow) => <span className="text-muted-foreground">{fmtDate(r.lastUsedAt) ?? "Never"}</span> },
    {
      key: "revokedAt",
      label: "Status",
      render: (r: KeyRow) =>
        r.revokedAt ? (
          <span className="inline-block rounded px-1.5 py-0.5 bg-red-500/15 text-red-400 font-medium">revoked</span>
        ) : (
          <span className="inline-block rounded px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 font-medium">active</span>
        ),
    },
    {
      key: "_select",
      label: (
        <Checkbox
          checked={revokedKeys.length > 0 && selectedRevoked.length === revokedKeys.length}
          onCheckedChange={toggleAllRevoked}
          aria-label="Select all revoked"
        />
      ),
      className: "w-10 text-center",
      render: (r: KeyRow) =>
        r.revokedAt ? (
          <Checkbox
            checked={selected.has(r.id as string)}
            onCheckedChange={() => toggleSelect(r.id as string)}
            aria-label="Select row"
          />
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium">API Keys</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {keys.length} total key{keys.length !== 1 ? "s" : ""}
        </span>
        {selectedRevoked.length > 0 && (
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleDelete}
              disabled={deleting}
              title={`Delete ${selectedRevoked.length} revoked key${selectedRevoked.length !== 1 ? "s" : ""}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </PageHeader>
      <div className="flex flex-col flex-1 min-h-0">
        {loading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={columns}
            rows={keys}
            emptyMessage="No API keys found"
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
