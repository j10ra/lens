export const DAEMON_URL = "http://localhost:4111";

async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res;
}

const API = `${DAEMON_URL}/api`;

export const api = {
  health: () => fetchOk(`${API}/health`).then((r) => r.json()),

  repos: () => fetchOk(`${API}/repos`).then((r) => r.json()),

  stats: () => fetchOk(`${API}/stats`).then((r) => r.json()),

  traces: (limit?: number) => fetchOk(`${API}/traces${limit != null ? `?limit=${limit}` : ""}`).then((r) => r.json()),

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

  reindex: (repoId: string) => fetchOk(`${API}/repos/${repoId}/index`, { method: "POST" }).then((r) => r.json()),

  registerRepo: (rootPath: string, name?: string) =>
    fetchOk(`${API}/repos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: rootPath, name }),
    }).then((r) => r.json()),

  removeRepo: (id: string) => fetchOk(`${API}/repos/${id}`, { method: "DELETE" }).then((r) => r.json()),
};
