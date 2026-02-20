const API = "http://localhost:4111/api/dashboard";

async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res;
}

export const api = {
  health: () => fetchOk(`${API}/health`).then((r) => r.json()),

  repos: () => fetchOk(`${API}/repos`).then((r) => r.json()),

  stats: () => fetchOk(`${API}/stats`).then((r) => r.json()),

  traces: (limit?: number, sources?: string[]) => {
    const qs = new URLSearchParams();
    if (limit != null) qs.set("limit", String(limit));
    if (sources?.length) qs.set("source", sources.join(","));
    const query = qs.toString();
    return fetchOk(`${API}/traces${query ? `?${query}` : ""}`).then((r) => r.json());
  },

  traceSpans: (traceId: string) => fetchOk(`${API}/traces/${traceId}`).then((r) => r.json()),

  repoFiles: (id: string, params?: { limit?: number; offset?: number; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    if (params?.search) qs.set("search", params.search);
    const query = qs.toString();
    return fetchOk(`${API}/repos/${id}/files${query ? `?${query}` : ""}`).then((r) => r.json());
  },

  repoFileDetail: (repoId: string, filePath: string) =>
    fetchOk(`${API}/repos/${repoId}/files/${encodeURIComponent(filePath)}`).then((r) => r.json()),

  openFile: (repoId: string, filePath: string, line?: number, column?: number) =>
    fetchOk(`${API}/repos/${repoId}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath, line, column }),
    }).then((r) => r.json()),

  repoStats: (repoId: string) => fetchOk(`${API}/repos/${repoId}/stats`).then((r) => r.json()),

  reindex: (repoId: string) => fetchOk(`${API}/repos/${repoId}/index`, { method: "POST" }).then((r) => r.json()),

  registerRepo: (rootPath: string, name?: string) =>
    fetchOk(`${API}/repos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: rootPath, name }),
    }).then((r) => r.json()),

  removeRepo: (id: string) => fetchOk(`${API}/repos/${id}`, { method: "DELETE" }).then((r) => r.json()),

  repoGraph: (repoPath: string, dir?: string) => {
    const body: { repoPath: string; dir?: string } = { repoPath };
    if (dir !== undefined) body.dir = dir;

    return fetchOk(`${API}/graph`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  },

  grep: (repoPath: string, query: string, limit = 20) =>
    fetchOk(`${API}/grep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoPath, query, limit }),
    }).then((r) => r.json()),
};
