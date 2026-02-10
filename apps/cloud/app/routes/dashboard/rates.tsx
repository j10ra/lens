import { useState, useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Save } from "lucide-react";
import { Button, PageHeader } from "@lens/ui";
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
        <div className="ml-auto">
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={!!saving}>
            {saving ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving..." : "Saved"}
          </Button>
        </div>
      </PageHeader>
      <div className="flex-1 min-h-0 overflow-auto">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            No quota rows found
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/60 text-left">
                <th className="w-12 border-b border-r border-border bg-muted/60 px-2 py-2 text-center font-medium text-muted-foreground">#</th>
                <th className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground">Plan</th>
                {FIELDS.map((f) => (
                  <th key={f.key} className="border-b border-r border-border bg-muted/60 px-3 py-2 font-medium text-muted-foreground last:border-r-0">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.plan} className="group hover:bg-accent/30">
                  <td className="border-b border-r border-border bg-muted/20 px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="border-b border-r border-border px-3 py-1.5 font-medium capitalize">{row.plan}</td>
                  {FIELDS.map((f) => (
                    <td key={f.key} className="border-b border-r border-border px-3 py-0.5 last:border-r-0">
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
      className={`w-24 rounded border border-transparent bg-transparent px-2 py-1 font-mono text-xs tabular-nums outline-none focus:border-primary focus:bg-background focus:ring-1 focus:ring-primary/30 ${saving ? "opacity-50" : ""}`}
    />
  );
}
