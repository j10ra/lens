import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Copy, Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { CloudAuthGuard } from "@/components/CloudAuthGuard";
import { PageHeader } from "@lens/ui";

function KeysContent() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["cloud-keys"],
    queryFn: api.cloudKeys,
  });

  const createMut = useMutation({
    mutationFn: (name: string) => api.cloudCreateKey(name),
    onSuccess: (result) => {
      setRevealedKey(result.key);
      setNewKeyName("");
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ["cloud-keys"] });
    },
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => api.cloudRevokeKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cloud-keys"] }),
  });

  const keys = (data?.keys ?? []).filter((k) => !k.revokedAt);
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-CA") : null);

  function handleCopy() {
    if (revealedKey) {
      navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">API Keys</h2>
          <p className="mt-1 text-sm text-muted-foreground">Manage keys for the LENS cloud API.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Create Key
        </button>
      </div>

      {revealedKey && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
          <p className="mb-2 text-sm font-medium text-warning">Copy your API key now. It won't be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-background px-3 py-2 font-mono text-xs">{revealedKey}</code>
            <button onClick={handleCopy} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-medium hover:bg-accent">
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button onClick={() => setRevealedKey(null)} className="mt-2 text-xs text-muted-foreground hover:text-foreground">Dismiss</button>
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (newKeyName.trim()) createMut.mutate(newKeyName.trim()); }}
          className="flex items-end gap-3 rounded-xl border bg-card p-4"
        >
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Key Name</label>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Production"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>
          <button type="submit" disabled={createMut.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {createMut.isPending ? "Creating..." : "Create"}
          </button>
          <button type="button" onClick={() => setShowCreate(false)} className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-4 py-2 text-sm hover:bg-accent">
            <X className="size-3" /> Cancel
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted">
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Key Prefix</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
              <th className="px-4 py-3 text-left font-medium">Last Used</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : keys.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No API keys. Create one to get started.</td></tr>
            ) : (
              keys.map((key) => (
                <tr key={key.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 font-medium">{key.name ?? "Unnamed"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{key.keyPrefix}...</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(key.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(key.lastUsedAt) ?? "Never"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => revokeMut.mutate(key.id)} className="text-xs text-destructive hover:text-destructive/80">Revoke</button>
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

export function Keys() {
  return (
    <>
      <PageHeader><h1 className="text-sm font-semibold">API Keys</h1></PageHeader>
      <main className="flex-1 overflow-auto p-4 lg:p-6">
        <CloudAuthGuard><KeysContent /></CloudAuthGuard>
      </main>
    </>
  );
}
