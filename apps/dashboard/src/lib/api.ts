const BASE = import.meta.env.DEV ? "" : "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  health: () => request<{ status: string; version: string; cloud_url: string }>("/health"),

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
        enable_embeddings: number;
        enable_summaries: number;
        enable_vocab_clusters: number;
        has_capabilities: boolean;
        watcher: { active: boolean; changed_files: number; started_at: string | null };
      }>;
    }>("/api/dashboard/repos"),

  repo: (id: string) => request<Record<string, unknown>>(`/api/dashboard/repos/${id}`),

  repoFiles: (id: string, params?: { limit?: number; offset?: number; search?: string }) => {
    const sp = new URLSearchParams();
    if (params?.limit) sp.set("limit", String(params.limit));
    if (params?.offset) sp.set("offset", String(params.offset));
    if (params?.search) sp.set("search", params.search);
    const qs = sp.toString();
    return request<{
      files: Array<{
        path: string;
        language: string | null;
        exports: string[];
        purpose: string;
        chunk_count: number;
        has_embedding: boolean;
      }>;
      total: number;
    }>(`/api/dashboard/repos/${id}/files${qs ? `?${qs}` : ""}`);
  },

  repoFileDetail: (repoId: string, filePath: string) =>
    request<{
      path: string;
      language: string | null;
      exports: string[];
      docstring: string;
      sections: string[];
      internals: string[];
      purpose: string;
      chunk_count: number;
      embedded_count: number;
      imports: string[];
      imported_by: string[];
      git: { commit_count: number; recent_count: number; last_modified: string | null } | null;
      cochanges: Array<{ path: string; count: number }>;
    }>(`/api/dashboard/repos/${repoId}/files/${encodeURIComponent(filePath)}`),

  repoChunks: (id: string, params?: { limit?: number; offset?: number; path?: string }) => {
    const sp = new URLSearchParams();
    if (params?.limit) sp.set("limit", String(params.limit));
    if (params?.offset) sp.set("offset", String(params.offset));
    if (params?.path) sp.set("path", params.path);
    const qs = sp.toString();
    return request<{
      chunks: Array<{
        id: string;
        path: string;
        chunk_index: number;
        start_line: number;
        end_line: number;
        language: string | null;
        has_embedding: boolean;
      }>;
      total: number;
    }>(`/api/dashboard/repos/${id}/chunks${qs ? `?${qs}` : ""}`);
  },

  repoChunkDetail: (repoId: string, chunkId: string) =>
    request<{
      id: string;
      path: string;
      chunk_index: number;
      start_line: number;
      end_line: number;
      content: string;
      language: string | null;
      chunk_hash: string;
      has_embedding: boolean;
    }>(`/api/dashboard/repos/${repoId}/chunks/${chunkId}`),

  repoVocabClusters: (id: string) =>
    request<{
      clusters: Array<{ terms: string[]; centroid_term?: string }>;
    }>(`/api/dashboard/repos/${id}/vocab-clusters`),

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
        response_body: string | null;
        trace: string | null;
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

  updateRepoSettings: (id: string, settings: { enable_embeddings?: boolean; enable_summaries?: boolean; enable_vocab_clusters?: boolean }) =>
    request<{ ok: boolean }>(`/api/dashboard/repos/${id}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }),

  routes: () =>
    request<{ routes: Array<{ method: string; path: string }> }>("/api/dashboard/routes"),

  reindex: (repoId: string) =>
    request<unknown>("/index/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_id: repoId, force: true }),
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
      plan: string | null;
      quota: Record<string, number> | null;
      has_capabilities: boolean;
    }>("/api/dashboard/usage"),

  authStatus: () =>
    request<{
      authenticated: boolean;
      email?: string;
      expires_at?: number;
      expired?: boolean;
    }>("/api/auth/status"),

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
      body: JSON.stringify({ interval, return_url: window.location.href }),
    }),

  cloudPortal: () =>
    request<{ url: string | null }>(`/api/cloud/billing/portal?return_url=${encodeURIComponent(window.location.href)}`),

  refreshPlan: () =>
    request<{ plan: string; has_capabilities: boolean; refreshed_at: number | null }>(
      "/api/dashboard/refresh-plan",
      { method: "POST" },
    ),

  getSettings: () =>
    request<{ settings: Record<string, string> }>("/api/dashboard/settings"),

  updateSettings: (settings: Record<string, string>) =>
    request<{ ok: boolean; settings: Record<string, string> }>("/api/dashboard/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }),
};
