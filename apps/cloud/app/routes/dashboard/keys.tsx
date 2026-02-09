import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "../dashboard";
import { getApiKeys, createApiKey, revokeApiKey } from "@/lib/server-fns";
import { Plus, Copy, Check, X } from "lucide-react";

export const Route = createFileRoute("/dashboard/keys")({
  component: ApiKeysPage,
});

interface ApiKey {
  id: string;
  name: string | null;
  keyPrefix: string;
  createdAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

function ApiKeysPage() {
  const { userId } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadKeys() {
    if (!userId) return;
    const rows = await getApiKeys({ data: { userId } });
    setKeys(rows.filter((k: ApiKey) => !k.revokedAt));
    setLoading(false);
  }

  useEffect(() => {
    loadKeys();
  }, [userId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    const result = await createApiKey({ data: { userId, name: newKeyName.trim() } });
    setRevealedKey(result.fullKey);
    setNewKeyName("");
    setShowCreate(false);
    setCreating(false);
    await loadKeys();
  }

  async function handleRevoke(keyId: string) {
    await revokeApiKey({ data: { keyId, userId } });
    await loadKeys();
  }

  function handleCopy() {
    if (revealedKey) {
      navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const fmtDate = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString("en-CA") : null;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">API Keys</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage keys for the LENS cloud API.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Create Key
        </button>
      </div>

      {/* Revealed key alert */}
      {revealedKey && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
          <p className="mb-2 text-sm font-medium text-warning">
            Copy your API key now. It won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-background px-3 py-2 font-mono text-xs text-foreground">
              {revealedKey}
            </code>
            <button
              onClick={handleCopy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setRevealedKey(null)}
            className="mt-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="flex items-end gap-3 rounded-xl border bg-card p-4"
        >
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Key Name
            </label>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Production"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-4 py-2 text-sm text-secondary-foreground transition-colors hover:bg-accent"
          >
            <X className="size-3" />
            Cancel
          </button>
        </form>
      )}

      {/* Keys table */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted">
              <th className="px-4 py-3 text-left font-medium text-foreground">
                Name
              </th>
              <th className="px-4 py-3 text-left font-medium text-foreground">
                Key Prefix
              </th>
              <th className="px-4 py-3 text-left font-medium text-foreground">
                Created
              </th>
              <th className="px-4 py-3 text-left font-medium text-foreground">
                Last Used
              </th>
              <th className="px-4 py-3 text-right font-medium text-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : (
              <>
                {keys.map((key) => (
                  <tr
                    key={key.id}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {key.name ?? "Unnamed"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {key.keyPrefix}...
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {fmtDate(key.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {fmtDate(key.lastUsedAt) ?? "Never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRevoke(key.id)}
                        className="text-xs text-destructive transition-colors hover:text-destructive/80"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
                {keys.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No API keys. Create one to get started.
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
