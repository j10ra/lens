import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "../dashboard";
import { getApiKeys, createApiKey, revokeApiKey } from "@/lib/server-fns";

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
          <p className="mt-1 text-sm text-zinc-400">
            Manage keys for the LENS cloud API.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
        >
          Create Key
        </button>
      </div>

      {/* Revealed key alert */}
      {revealedKey && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
          <p className="mb-2 text-sm font-medium text-yellow-400">
            Copy your API key now. It won't be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200">
              {revealedKey}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setRevealedKey(null)}
            className="mt-2 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="flex items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4"
        >
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Key Name
            </label>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Production"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Keys table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900">
              <th className="px-4 py-3 text-left font-medium text-zinc-300">
                Name
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-300">
                Key Prefix
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-300">
                Created
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-300">
                Last Used
              </th>
              <th className="px-4 py-3 text-right font-medium text-zinc-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  Loading...
                </td>
              </tr>
            ) : (
              <>
                {keys.map((key) => (
                  <tr
                    key={key.id}
                    className="border-b border-zinc-800/50 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-200">
                      {key.name ?? "Unnamed"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                      {key.keyPrefix}...
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {fmtDate(key.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {fmtDate(key.lastUsedAt) ?? "Never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRevoke(key.id)}
                        className="text-xs text-red-400 transition-colors hover:text-red-300"
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
                      className="px-4 py-8 text-center text-zinc-500"
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
