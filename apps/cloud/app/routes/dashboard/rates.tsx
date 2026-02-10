import { useState, useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@lens/ui";
import { adminGetQuotas, adminUpdateQuota } from "@/lib/server-fns";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/dashboard/rates")({
  component: RatesPage,
});

interface QuotaRow {
  plan: string;
  maxRepos: number;
  contextQueries: number;
  embeddingRequests: number;
  embeddingChunks: number;
  purposeRequests: number;
  reposIndexed: number;
}

const FIELDS: { key: keyof Omit<QuotaRow, "plan">; label: string }[] = [
  { key: "maxRepos", label: "Max Repos" },
  { key: "contextQueries", label: "Context Queries" },
  { key: "embeddingRequests", label: "Embedding Requests" },
  { key: "embeddingChunks", label: "Embedding Chunks" },
  { key: "purposeRequests", label: "Purpose Requests" },
  { key: "reposIndexed", label: "Repos Indexed" },
];

function RatesPage() {
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<QuotaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    adminGetQuotas({ data: { accessToken } })
      .then((data) => setRows(data as QuotaRow[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function handleSave(plan: string, key: string, value: number) {
    if (!accessToken) return;
    setSaving(`${plan}.${key}`);
    try {
      await adminUpdateQuota({ data: { accessToken, plan, values: { [key]: value } } });
    } catch {} finally {
      setSaving(null);
    }
  }

  return (
    <>
      <PageHeader>
        <span className="text-sm font-medium">Rate Limits</span>
        <span className="text-xs text-muted-foreground">Configure plan quotas</span>
      </PageHeader>
      <div className="flex flex-col flex-1 min-h-0 overflow-auto">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="px-4 py-4 lg:px-6">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Plan</th>
                    {FIELDS.map((f) => (
                      <th key={f.key} className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.plan} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium capitalize">{row.plan}</td>
                      {FIELDS.map((f) => (
                        <td key={f.key} className="px-4 py-1">
                          <EditableCell
                            value={row[f.key]}
                            saving={saving === `${row.plan}.${f.key}`}
                            onSave={(v) => {
                              setRows((prev) =>
                                prev.map((r) =>
                                  r.plan === row.plan ? { ...r, [f.key]: v } : r,
                                ),
                              );
                              handleSave(row.plan, f.key, v);
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function EditableCell({
  value,
  saving,
  onSave,
}: {
  value: number;
  saving: boolean;
  onSave: (v: number) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState(String(value));

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  function commit() {
    const parsed = Number.parseInt(local, 10);
    if (!Number.isNaN(parsed) && parsed !== value) {
      onSave(parsed);
    } else {
      setLocal(String(value));
    }
  }

  return (
    <input
      ref={ref}
      type="number"
      min={0}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") ref.current?.blur();
      }}
      className={`w-28 rounded border bg-transparent px-2 py-1 text-sm tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 ${saving ? "opacity-50" : ""}`}
    />
  );
}
