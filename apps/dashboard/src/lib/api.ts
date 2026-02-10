const BASE = import.meta.env.DEV ? "" : "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  health: () => request<{ status: string; version: string }>("/health"),

  stats: () =>
    request<{
      repos_count: number;
      total_chunks: number;
      total_embeddings: number;
      total_summaries: number;
      total_vocab_clusters: number;
      db_size_mb: number;
      uptime_seconds: number;
    }>("/api/dashboard/stats"),

  repos: () =>
    request<{
      repos: Array<{
        id: string;
        name: string;
        root_path: string;
        index_status: string;
        chunk_count: number;
        files_indexed: number;
        embedded_count: number;
        embeddable_count: number;
        embedded_pct: number;
        purpose_count: number;
        purpose_total: number;
        vocab_cluster_count: number;
        last_indexed_at: string | null;
        last_indexed_commit: string | null;
        max_import_depth: number;
        has_capabilities: boolean;
        watcher: { active: boolean; changed_files: number; started_at: string | null };
      }>;
    }>("/api/dashboard/repos"),

  repo: (id: string) => request<Record<string, unknown>>(`/api/dashboard/repos/${id}`),

  logs: (params?: { limit?: number; offset?: number; method?: string; path?: string; status?: number; source?: string }) => {
    const sp = new URLSearchParams();
    if (params?.limit) sp.set("limit", String(params.limit));
    if (params?.offset) sp.set("offset", String(params.offset));
    if (params?.method) sp.set("method", params.method);
    if (params?.path) sp.set("path", params.path);
    if (params?.status) sp.set("status", String(params.status));
    if (params?.source) sp.set("source", params.source);
    const qs = sp.toString();
    return request<{
      rows: Array<{
        id: string;
        method: string;
        path: string;
        status: number;
        duration_ms: number;
        source: string;
        request_body: string | null;
        response_size: number | null;
        created_at: string;
      }>;
      total: number;
      summary: { total_today: number; by_source: Array<{ source: string; count: number }>; by_endpoint: Array<{ method: string; path: string; count: number }> };
    }>(`/api/dashboard/logs${qs ? `?${qs}` : ""}`);
  },

  tables: () =>
    request<{ tables: Array<{ name: string; count: number }> }>("/api/dashboard/tables"),

  tableRows: (name: string, limit = 50, offset = 0) =>
    request<{ columns: string[]; rows: Record<string, unknown>[]; total: number }>(
      `/api/dashboard/tables/${encodeURIComponent(name)}?limit=${limit}&offset=${offset}`,
    ),

  jobs: () =>
    request<{
      repos: Array<{
        id: string;
        name: string;
        index_status: string;
        last_indexed_commit: string | null;
        last_indexed_at: string | null;
        is_stale: boolean;
        current_head: string | null;
        chunk_count: number;
        embedded_count: number;
        embeddable_count: number;
        purpose_count: number;
        purpose_total: number;
        watcher: { active: boolean; changed_files: number; started_at: string | null };
      }>;
    }>("/api/dashboard/jobs"),

  routes: () =>
    request<{ routes: Array<{ method: string; path: string }> }>("/api/dashboard/routes"),

  reindex: (repoId: string) =>
    request<unknown>("/index/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_id: repoId, force: false }),
    }),

  startWatcher: (repoId: string) =>
    request<unknown>("/index/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_id: repoId }),
    }),

  stopWatcher: (repoId: string) =>
    request<unknown>("/index/unwatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_id: repoId }),
    }),

  buildContext: (repoId: string, goal: string) =>
    request<{
      context_pack: string;
      stats: {
        files_in_context: number;
        index_fresh: boolean;
        duration_ms: number;
        cached: boolean;
      };
    }>("/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_id: repoId, goal }),
    }),

  registerRepo: (rootPath: string, name?: string) =>
    request<{ repo_id: string; created: boolean }>("/repo/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root_path: rootPath, name }),
    }),

  removeRepo: (id: string) =>
    request<{ removed: boolean }>(`/repo/${id}`, { method: "DELETE" }),

  localUsage: () =>
    request<{
      today: {
        context_queries: number;
        embedding_requests: number;
        embedding_chunks: number;
        purpose_requests: number;
        repos_indexed: number;
      };
      synced_at: string | null;
    }>("/api/dashboard/usage"),

  syncStatus: () =>
    request<{
      lastRunAt: string | null;
      lastResult: "success" | "partial" | "error" | "skipped" | null;
      lastError: string | null;
      rowsSynced: number;
      rowsFailed: number;
      nextRunAt: string;
      unsyncedRows: number;
      unsyncedDates: string[];
    }>("/api/dashboard/sync"),

  authStatus: () =>
    request<{
      authenticated: boolean;
      email?: string;
      expires_at?: number;
      expired?: boolean;
    }>("/api/auth/status"),

  // Cloud proxy methods
  cloudUsageCurrent: () =>
    request<{
      plan: string;
      periodStart: string;
      usage: Record<string, number> | null;
      quota: Record<string, number>;
    }>("/api/cloud/usage/current"),

  cloudUsageRange: (start: string, end: string) =>
    request<{
      usage: Array<{
        date: string;
        contextQueries: number | null;
        embeddingRequests: number | null;
        purposeRequests: number | null;
      }>;
    }>(`/api/cloud/usage?start=${start}&end=${end}`),

  cloudSubscription: () =>
    request<{
      subscription: {
        plan: string | null;
        status: string | null;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean | null;
        stripeCustomerId: string | null;
      };
    }>("/api/cloud/subscription"),

  cloudCheckout: (interval: "monthly" | "yearly" = "monthly") =>
    request<{ url: string | null }>("/api/cloud/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval }),
    }),

  cloudPortal: () =>
    request<{ url: string | null }>("/api/cloud/billing/portal"),
};
