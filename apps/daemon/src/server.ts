import { Hono } from "hono";
import { existsSync, readFileSync, writeFileSync, statSync, watch } from "node:fs";
import { join, extname } from "node:path";
import { homedir } from "node:os";
import type { Db, Capabilities } from "@lens/engine";
import { getCloudUrl, ensureTelemetryId, isTelemetryEnabled, getTelemetryId } from "./config";
import {
  registerRepo,
  getRepo,
  listRepos,
  removeRepo,
  getRepoStatus,
  runIndex,
  buildContext,
  startWatcher,
  stopWatcher,
  getWatcherStatus,
  getHeadCommit,
  repoQueries,
  chunkQueries,
  metadataQueries,
  logQueries,
  ensureEmbedded,
  enrichPurpose,
  getRawDb,
  usageQueries,
  telemetryQueries,
  track,
  setTelemetryEnabled,
} from "@lens/engine";

const TEMPLATE = `<!-- LENS — Repo Context Daemon -->
## LENS Context

This repo is indexed by LENS. Use the MCP context tool or run:
\`\`\`
lens context "<your goal>"
\`\`\``;

const startedAt = Date.now();

function getDbSizeMb(): number {
  const dbPath = join(homedir(), ".lens", "data.db");
  try {
    return Math.round((statSync(dbPath).size / 1024 / 1024) * 10) / 10;
  } catch {
    return 0;
  }
}

function deriveSource(req: Request, path: string): string {
  if (path.startsWith("/api/dashboard/") || path.startsWith("/dashboard")) return "dashboard";
  const ua = req.headers.get("user-agent") ?? "";
  if (ua.includes("lens-cli")) return "cli";
  if (ua.includes("mcp") || path.includes("/mcp")) return "mcp";
  return "api";
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

// --- Quota Cache (5-min TTL) ---

interface QuotaSnapshot {
  plan: string;
  usage: Record<string, number>;
  quota: Record<string, number>;
  fetchedAt: number;
}

const QUOTA_TTL = 5 * 60_000;
let quotaCache: QuotaSnapshot | null = null;

function quotaRemaining(key: string): number {
  if (!quotaCache) return Infinity;
  const limit = quotaCache.quota[key];
  const used = quotaCache.usage[key];
  if (limit === undefined || limit === 0) return 0;
  return Math.max(0, limit - (used ?? 0));
}

export function createApp(
  db: Db,
  dashboardDist?: string,
  initialCaps?: Capabilities,
  initialPlanData?: { plan: string; usage: Record<string, number>; quota: Record<string, number> },
): Hono & { stopTelemetrySync?: () => void } {
  let caps = initialCaps;

  // Seed quota cache from startup plan check — eliminates race on first dashboard load
  if (initialPlanData) {
    quotaCache = { ...initialPlanData, fetchedAt: Date.now() };
  }
  const app = new Hono() as Hono & { stopTelemetrySync?: () => void };

  // --- Telemetry Init ---
  const telemetryEnabled = isTelemetryEnabled();
  setTelemetryEnabled(telemetryEnabled);
  const { telemetry_id, first_run } = ensureTelemetryId();

  if (first_run) {
    console.log(
      "[LENS] Anonymous telemetry is enabled. No PII, no repo paths, no code.\n" +
      "[LENS] Opt out: lens config set telemetry false",
    );
    track(db, "install", {
      os: process.platform,
      arch: process.arch,
      node_version: process.version,
      lens_version: "0.1.0",
    });
  }

  // Collect registered route paths for /api/dashboard/routes
  const registeredRoutes: Array<{ method: string; path: string }> = [];
  function trackRoute(method: string, path: string) {
    registeredRoutes.push({ method: method.toUpperCase(), path });
  }

  // --- Request Logging Middleware ---

  let lastPrune = 0;
  app.use("*", async (c, next) => {
    const start = performance.now();
    await next();
    const duration = Math.round(performance.now() - start);
    const path = new URL(c.req.url).pathname;
    const source = deriveSource(c.req.raw, path);

    if (path.startsWith("/dashboard/") && !path.startsWith("/api/")) return;
    if (path === "/health") return;

    try {
      logQueries.insert(db, c.req.method, path, c.res.status, duration, source);
      // Prune at most once per hour
      const now = Date.now();
      if (now - lastPrune > 3_600_000) {
        lastPrune = now;
        logQueries.prune(db);
      }
    } catch {}
  });

  // --- Health ---

  trackRoute("GET", "/health");
  app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

  // --- Telemetry Track (for CLI) ---

  trackRoute("POST", "/telemetry/track");
  app.post("/telemetry/track", async (c) => {
    try {
      if (!isTelemetryEnabled()) return c.json({ ok: true, skipped: true });
      const { event_type, event_data } = await c.req.json();
      if (!event_type || typeof event_type !== "string") return c.json({ error: "event_type required" }, 400);
      track(db, event_type, event_data);
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: true });
    }
  });

  // --- Repo ---

  trackRoute("POST", "/repo/register");
  app.post("/repo/register", async (c) => {
    try {
      const { root_path, name, remote_url } = await c.req.json();
      if (!root_path) return c.json({ error: "root_path required" }, 400);

      // Registration limit check
      const currentRepos = listRepos(db).length;
      const maxRepos = quotaCache?.quota?.maxRepos ?? 50;
      if (currentRepos >= maxRepos) {
        return c.json({
          error: "Repo limit reached",
          current: currentRepos,
          limit: maxRepos,
          plan: quotaCache?.plan ?? "unknown",
        }, 429);
      }

      const result = registerRepo(db, root_path, name, remote_url);

      if (result.created) {
        runIndex(db, result.repo_id, caps, false, emitRepoEvent)
          .then((r) => {
            if (r.files_scanned > 0) usageQueries.increment(db, "repos_indexed");
            const tasks: Promise<any>[] = [];
            if (quotaRemaining("embeddingChunks") > 0) {
              tasks.push(ensureEmbedded(db, result.repo_id, caps));
            } else {
              console.log("[LENS] Skipping embeddings: quota exceeded");
            }
            if (quotaRemaining("purposeRequests") > 0) {
              tasks.push(enrichPurpose(db, result.repo_id, caps));
            } else {
              console.log("[LENS] Skipping purpose enrichment: quota exceeded");
            }
            return Promise.all(tasks);
          })
          .catch((e) => console.error("[LENS] post-register index failed:", e));
      }

      startWatcher(db, result.repo_id, root_path);
      emitRepoEvent();
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/repo/list");
  app.get("/repo/list", (c) => {
    try {
      return c.json({ repos: listRepos(db) });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/repo/list/detailed");
  app.get("/repo/list/detailed", (c) => {
    try {
      const repos = listRepos(db);
      const detailed = repos.map((r) => {
        const stats = chunkQueries.getStats(db, r.id);
        return {
          id: r.id,
          name: r.name,
          root_path: r.root_path,
          index_status: r.index_status,
          chunk_count: stats.chunk_count,
          files_indexed: stats.files_indexed,
          embedded_pct:
            stats.embeddable_count > 0 ? Math.round((stats.embedded_count / stats.embeddable_count) * 100) : 0,
          last_indexed_at: r.last_indexed_at,
        };
      });
      return c.json({ repos: detailed });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/repo/template");
  app.get("/repo/template", (c) => c.json({ content: TEMPLATE }));

  trackRoute("GET", "/repo/:id");
  app.get("/repo/:id", (c) => {
    try {
      const repo = getRepo(db, c.req.param("id"));
      return c.json(repo);
    } catch (e: any) {
      if (e.message === "repo not found") return c.json({ error: "repo not found" }, 404);
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("DELETE", "/repo/:id");
  app.delete("/repo/:id", async (c) => {
    try {
      const id = c.req.param("id");
      await stopWatcher(id).catch(() => {});
      const result = removeRepo(db, id);
      emitRepoEvent();
      return c.json(result);
    } catch (e: any) {
      if (e.message === "repo not found") return c.json({ error: "repo not found" }, 404);
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/repo/:id/status");
  app.get("/repo/:id/status", async (c) => {
    try {
      const status = await getRepoStatus(db, c.req.param("id"));
      return c.json({
        ...status,
        has_capabilities: !!caps,
        embedding_quota_exceeded: quotaRemaining("embeddingRequests") <= 0 && quotaRemaining("embeddingChunks") <= 0,
        purpose_quota_exceeded: quotaRemaining("purposeRequests") <= 0,
      });
    } catch (e: any) {
      if (e.message === "repo not found") return c.json({ error: "repo not found" }, 404);
      return c.json({ error: e.message }, 500);
    }
  });

  // --- Context ---

  trackRoute("POST", "/context");
  app.post("/context", async (c) => {
    try {
      const { repo_id, goal } = await c.req.json();
      if (!repo_id || !goal) return c.json({ error: "repo_id and goal required" }, 400);
      const result = await buildContext(db, repo_id, goal, caps);
      usageQueries.increment(db, "context_queries");
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // --- Index ---

  trackRoute("POST", "/index/run");
  app.post("/index/run", async (c) => {
    try {
      const { repo_id, force } = await c.req.json();
      if (!repo_id) return c.json({ error: "repo_id required" }, 400);
      const result = await runIndex(db, repo_id, caps, force ?? false, emitRepoEvent);
      if (result.files_scanned > 0) usageQueries.increment(db, "repos_indexed");

      const tasks: Promise<any>[] = [];
      if (quotaRemaining("embeddingChunks") > 0) {
        tasks.push(ensureEmbedded(db, repo_id, caps));
      } else {
        console.log("[LENS] Skipping embeddings: quota exceeded");
      }
      if (quotaRemaining("purposeRequests") > 0) {
        tasks.push(enrichPurpose(db, repo_id, caps));
      } else {
        console.log("[LENS] Skipping purpose enrichment: quota exceeded");
      }
      Promise.all(tasks).catch((e) => console.error("[LENS] post-index embed/enrich failed:", e));

      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/index/status/:repo_id");
  app.get("/index/status/:repo_id", async (c) => {
    try {
      const repoId = c.req.param("repo_id");
      const repo = repoQueries.getById(db, repoId);
      if (!repo) return c.json({ error: "repo not found" }, 404);

      let currentHead: string | null = null;
      try {
        currentHead = await getHeadCommit(repo.root_path);
      } catch {}

      const isStale = !!(currentHead && repo.last_indexed_commit !== currentHead);
      const stats = chunkQueries.getStats(db, repoId);

      return c.json({
        index_status: repo.index_status,
        last_indexed_commit: repo.last_indexed_commit,
        last_indexed_at: repo.last_indexed_at,
        current_head: currentHead,
        is_stale: isStale,
        chunk_count: stats.chunk_count,
        files_indexed: stats.files_indexed,
        chunks_with_embeddings: stats.embedded_count,
        has_capabilities: !!caps,
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("POST", "/index/watch");
  app.post("/index/watch", async (c) => {
    try {
      const { repo_id } = await c.req.json();
      if (!repo_id) return c.json({ error: "repo_id required" }, 400);
      const repo = getRepo(db, repo_id);
      const result = startWatcher(db, repo_id, repo.root_path);
      emitRepoEvent();
      return c.json(result);
    } catch (e: any) {
      if (e.message === "repo not found") return c.json({ error: "repo not found" }, 404);
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("POST", "/index/unwatch");
  app.post("/index/unwatch", async (c) => {
    try {
      const { repo_id } = await c.req.json();
      if (!repo_id) return c.json({ error: "repo_id required" }, 400);
      const result = await stopWatcher(repo_id);
      emitRepoEvent();
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/index/watch-status/:repo_id");
  app.get("/index/watch-status/:repo_id", (c) => {
    try {
      return c.json(getWatcherStatus(c.req.param("repo_id")));
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // --- Daemon ---

  trackRoute("GET", "/daemon/stats");
  app.get("/daemon/stats", (c) => {
    try {
      const repos = listRepos(db);
      let totalChunks = 0;
      let totalEmbeddings = 0;
      for (const r of repos) {
        const s = chunkQueries.getStats(db, r.id);
        totalChunks += s.chunk_count;
        totalEmbeddings += s.embedded_count;
      }
      return c.json({
        repos_count: repos.length,
        total_chunks: totalChunks,
        total_embeddings: totalEmbeddings,
        db_size_mb: getDbSizeMb(),
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // --- Auth Status ---

  const SUPABASE_URL = "https://kuvsaycpvbbmyyxiklap.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dnNheWNwdmJibXl5eGlrbGFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MzIxNzQsImV4cCI6MjA4NjIwODE3NH0.yllrNUWVHUyFBwegoIeBkiHiIiWcsspHL9126nT2o2Q";

  interface AuthTokens {
    access_token: string;
    refresh_token: string;
    user_email: string;
    user_id?: string;
    expires_at: number;
  }

  function readAuthSync(): AuthTokens | null {
    const authPath = join(homedir(), ".lens", "auth.json");
    try {
      return JSON.parse(readFileSync(authPath, "utf-8"));
    } catch {
      return null;
    }
  }

  function writeAuthSync(tokens: AuthTokens): void {
    const authPath = join(homedir(), ".lens", "auth.json");
    writeFileSync(authPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  }

  async function tryRefreshToken(token: string): Promise<AuthTokens | null> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: token }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user_email: data.user?.email ?? "unknown",
      user_id: data.user?.id,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    };
  }

  // SSE: repo mutation bus — notify dashboard on register/remove/index/watch changes
  const repoClients = new Set<ReadableStreamDefaultController>();
  const encoder = new TextEncoder();

  function emitRepoEvent() {
    for (const ctrl of repoClients) {
      try { ctrl.enqueue(encoder.encode("data: repo-changed\n\n")); }
      catch { repoClients.delete(ctrl); }
    }
  }

  trackRoute("GET", "/api/repo/events");
  app.get("/api/repo/events", (c) => {
    const stream = new ReadableStream({
      start(ctrl) { repoClients.add(ctrl); },
      cancel(ctrl) { repoClients.delete(ctrl as ReadableStreamDefaultController); },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  // SSE: watch ~/.lens/auth.json and push changes to connected clients
  const authClients = new Set<ReadableStreamDefaultController>();
  const authDir = join(homedir(), ".lens");
  try {
    watch(authDir, (_, filename) => {
      if (filename !== "auth.json") return;
      for (const ctrl of authClients) {
        try { ctrl.enqueue(new TextEncoder().encode("data: auth-changed\n\n")); }
        catch { authClients.delete(ctrl); }
      }
    });
  } catch {}

  trackRoute("GET", "/api/auth/events");
  app.get("/api/auth/events", (c) => {
    const stream = new ReadableStream({
      start(ctrl) { authClients.add(ctrl); },
      cancel(ctrl) { authClients.delete(ctrl as ReadableStreamDefaultController); },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  trackRoute("GET", "/api/auth/status");
  app.get("/api/auth/status", async (c) => {
    try {
      let auth = readAuthSync();
      if (!auth) return c.json({ authenticated: false });

      const now = Math.floor(Date.now() / 1000);
      if (auth.expires_at <= now && auth.refresh_token) {
        const refreshed = await tryRefreshToken(auth.refresh_token);
        if (refreshed) {
          writeAuthSync(refreshed);
          auth = refreshed;
        } else {
          return c.json({ authenticated: false, expired: true });
        }
      }

      return c.json({
        authenticated: true,
        email: auth.user_email,
        expires_at: auth.expires_at,
      });
    } catch {
      return c.json({ authenticated: false });
    }
  });

  // --- Cloud Proxy ---

  const CLOUD_API_URL = getCloudUrl();

  async function readApiKey(): Promise<string | null> {
    const authPath = join(homedir(), ".lens", "auth.json");
    try {
      const data = JSON.parse(readFileSync(authPath, "utf-8"));
      if (data.api_key) return data.api_key;
      // Auto-provision if access_token exists but api_key missing
      if (!data.access_token) return null;
      const res = await fetch(`${CLOUD_API_URL}/auth/key`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      if (!res.ok) return null;
      const { api_key } = (await res.json()) as { api_key: string };
      data.api_key = api_key;
      writeFileSync(authPath, JSON.stringify(data, null, 2), { mode: 0o600 });
      return api_key;
    } catch {
      return null;
    }
  }

  async function cloudProxy(method: string, path: string, body?: unknown): Promise<Response> {
    const apiKey = await readApiKey();
    if (!apiKey) {
      return Response.json({ error: "Not authenticated. Run: lens login" }, { status: 401 });
    }
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    };
    if (body) init.body = JSON.stringify(body);
    const res = await fetch(`${CLOUD_API_URL}${path}`, init);
    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Usage
  trackRoute("GET", "/api/cloud/usage");
  app.get("/api/cloud/usage", async (c) => {
    const start = c.req.query("start");
    const end = c.req.query("end");
    return cloudProxy("GET", `/api/usage?start=${start}&end=${end}`);
  });

  trackRoute("GET", "/api/cloud/usage/current");
  app.get("/api/cloud/usage/current", async () =>
    cloudProxy("GET", "/api/usage/current"),
  );

  // Subscription
  trackRoute("GET", "/api/cloud/subscription");
  app.get("/api/cloud/subscription", async () =>
    cloudProxy("GET", "/api/subscription"),
  );

  // Billing
  trackRoute("POST", "/api/cloud/billing/checkout");
  app.post("/api/cloud/billing/checkout", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return cloudProxy("POST", "/api/billing/checkout", body);
  });

  trackRoute("GET", "/api/cloud/billing/portal");
  app.get("/api/cloud/billing/portal", async () =>
    cloudProxy("GET", "/api/billing/portal"),
  );

  // --- Dashboard API ---

  trackRoute("GET", "/api/dashboard/stats");
  app.get("/api/dashboard/stats", (c) => {
    try {
      const repos = listRepos(db);
      let totalChunks = 0;
      let totalEmbeddings = 0;
      let totalSummaries = 0;
      let totalVocabClusters = 0;
      for (const r of repos) {
        const s = chunkQueries.getStats(db, r.id);
        const structural = metadataQueries.getStructuralStats(db, r.id);
        totalChunks += s.chunk_count;
        totalEmbeddings += s.embedded_count;
        totalSummaries += structural.purpose_count;
        totalVocabClusters += r.vocab_clusters ? (JSON.parse(r.vocab_clusters) as unknown[]).length : 0;
      }
      return c.json({
        repos_count: repos.length,
        total_chunks: totalChunks,
        total_embeddings: totalEmbeddings,
        total_summaries: totalSummaries,
        total_vocab_clusters: totalVocabClusters,
        db_size_mb: getDbSizeMb(),
        uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/api/dashboard/repos");
  app.get("/api/dashboard/repos", (c) => {
    try {
      const repos = listRepos(db);
      const result = repos.map((r) => {
        const stats = chunkQueries.getStats(db, r.id);
        const structural = metadataQueries.getStructuralStats(db, r.id);
        const watcher = getWatcherStatus(r.id);
        return {
          id: r.id,
          name: r.name,
          root_path: r.root_path,
          index_status: r.index_status,
          chunk_count: stats.chunk_count,
          files_indexed: stats.files_indexed,
          embedded_count: stats.embedded_count,
          embeddable_count: stats.embeddable_count,
          embedded_pct:
            stats.embeddable_count > 0 ? Math.round((stats.embedded_count / stats.embeddable_count) * 100) : 0,
          purpose_count: structural.purpose_count,
          purpose_total: structural.purpose_total,
          vocab_cluster_count: r.vocab_clusters ? (JSON.parse(r.vocab_clusters) as unknown[]).length : 0,
          last_indexed_at: r.last_indexed_at,
          last_indexed_commit: r.last_indexed_commit,
          max_import_depth: r.max_import_depth,
          has_capabilities: !!caps,
          watcher: {
            active: watcher.watching,
            changed_files: watcher.changed_files ?? 0,
            started_at: watcher.started_at ?? null,
          },
        };
      });
      return c.json({ repos: result });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/api/dashboard/repos/:id");
  app.get("/api/dashboard/repos/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const repo = repoQueries.getById(db, id);
      if (!repo) return c.json({ error: "repo not found" }, 404);
      const stats = chunkQueries.getStats(db, id);
      const structural = metadataQueries.getStructuralStats(db, id);
      const watcher = getWatcherStatus(id);
      let currentHead: string | null = null;
      try { currentHead = await getHeadCommit(repo.root_path); } catch {}
      const vocabClusters: unknown[] = repo.vocab_clusters ? JSON.parse(repo.vocab_clusters) : [];
      return c.json({
        ...repo,
        ...stats,
        ...structural,
        vocab_cluster_count: Array.isArray(vocabClusters) ? vocabClusters.length : 0,
        current_head: currentHead,
        is_stale: !!(currentHead && repo.last_indexed_commit !== currentHead),
        has_capabilities: !!caps,
        watcher: {
          active: watcher.watching,
          changed_files: watcher.changed_files ?? 0,
          started_at: watcher.started_at ?? null,
        },
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/api/dashboard/logs");
  app.get("/api/dashboard/logs", (c) => {
    try {
      const q = c.req.query();
      const result = logQueries.list(db, {
        limit: q.limit ? Number(q.limit) : 50,
        offset: q.offset ? Number(q.offset) : 0,
        method: q.method || undefined,
        path: q.path || undefined,
        status: q.status ? Number(q.status) : undefined,
        source: q.source || undefined,
      });
      const summary = logQueries.summary(db);
      return c.json({ ...result, summary });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/api/dashboard/tables");
  app.get("/api/dashboard/tables", (c) => {
    try {
      const raw = getRawDb();
      const tables = raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name")
        .all() as Array<{ name: string }>;
      const result = tables.map((t) => {
        const row = raw.prepare(`SELECT count(*) as count FROM "${t.name}"`).get() as { count: number };
        return { name: t.name, count: row.count };
      });
      return c.json({ tables: result });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/api/dashboard/tables/:name");
  app.get("/api/dashboard/tables/:name", (c) => {
    try {
      const name = c.req.param("name");
      const limit = Number(c.req.query("limit") || 50);
      const offset = Number(c.req.query("offset") || 0);
      const raw = getRawDb();

      // Validate table name exists
      const tableCheck = raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(name);
      if (!tableCheck) return c.json({ error: "table not found" }, 404);

      const columns = (raw.prepare(`PRAGMA table_info("${name}")`).all() as Array<{ name: string }>).map(
        (col) => col.name,
      );
      const rows = raw.prepare(`SELECT * FROM "${name}" LIMIT ? OFFSET ?`).all(limit, offset);
      const total = (raw.prepare(`SELECT count(*) as count FROM "${name}"`).get() as { count: number }).count;

      // Strip binary blobs for display
      const cleanRows = (rows as Record<string, unknown>[]).map((row) => {
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          clean[k] = v instanceof Buffer ? `<blob ${v.length} bytes>` : v;
        }
        return clean;
      });

      return c.json({ columns, rows: cleanRows, total });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/api/dashboard/jobs");
  app.get("/api/dashboard/jobs", async (c) => {
    try {
      const repos = listRepos(db);
      const result = await Promise.all(
        repos.map(async (r) => {
          const stats = chunkQueries.getStats(db, r.id);
          const structural = metadataQueries.getStructuralStats(db, r.id);
          const watcher = getWatcherStatus(r.id);
          let currentHead: string | null = null;
          try { currentHead = await getHeadCommit(r.root_path); } catch {}
          return {
            id: r.id,
            name: r.name,
            index_status: r.index_status,
            last_indexed_commit: r.last_indexed_commit,
            last_indexed_at: r.last_indexed_at,
            is_stale: !!(currentHead && r.last_indexed_commit !== currentHead),
            current_head: currentHead,
            chunk_count: stats.chunk_count,
            embedded_count: stats.embedded_count,
            embeddable_count: stats.embeddable_count,
            purpose_count: structural.purpose_count,
            purpose_total: structural.purpose_total,
            watcher: {
              active: watcher.watching,
              changed_files: watcher.changed_files ?? 0,
              started_at: watcher.started_at ?? null,
            },
          };
        }),
      );
      return c.json({ repos: result });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/api/dashboard/usage");
  app.get("/api/dashboard/usage", (c) => {
    try {
      const today = usageQueries.getToday(db);
      const local = {
        context_queries: today?.context_queries ?? 0,
        embedding_requests: today?.embedding_requests ?? 0,
        embedding_chunks: today?.embedding_chunks ?? 0,
        purpose_requests: today?.purpose_requests ?? 0,
        repos_indexed: today?.repos_indexed ?? 0,
      };
      // For quota-enforced features, use cloud usage (source of truth for quota checks)
      const cloud = quotaCache?.usage;
      return c.json({
        today: {
          context_queries: local.context_queries,
          embedding_requests: Math.max(local.embedding_requests, cloud?.embeddingRequests ?? 0),
          embedding_chunks: Math.max(local.embedding_chunks, cloud?.embeddingChunks ?? 0),
          purpose_requests: Math.max(local.purpose_requests, cloud?.purposeRequests ?? 0),
          repos_indexed: local.repos_indexed,
        },
        synced_at: today?.synced_at ?? null,
        plan: quotaCache?.plan ?? null,
        quota: quotaCache?.quota ?? null,
        has_capabilities: !!caps,
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/api/dashboard/routes");
  app.get("/api/dashboard/routes", (c) => {
    return c.json({ routes: registeredRoutes });
  });

  // --- Dashboard Static Files ---

  if (dashboardDist && existsSync(dashboardDist)) {
    app.get("/dashboard/*", (c) => {
      const url = new URL(c.req.url);
      let filePath = url.pathname.replace("/dashboard", "");
      if (!filePath || filePath === "/") filePath = "/index.html";

      const fullPath = join(dashboardDist, filePath);
      if (existsSync(fullPath) && statSync(fullPath).isFile()) {
        const content = readFileSync(fullPath);
        const mime = MIME_TYPES[extname(fullPath)] ?? "application/octet-stream";
        return new Response(content, { headers: { "Content-Type": mime, "Cache-Control": "public, max-age=3600" } });
      }

      // SPA fallback
      const indexPath = join(dashboardDist, "index.html");
      if (existsSync(indexPath)) {
        return new Response(readFileSync(indexPath), {
          headers: { "Content-Type": "text/html" },
        });
      }

      return c.json({ error: "not found" }, 404);
    });

    // Redirect /dashboard to /dashboard/
    app.get("/dashboard", (c) => c.redirect("/dashboard/"));
  }

  // --- Quota Cache (refresh every 5 minutes) ---

  async function refreshQuotaCache() {
    try {
      const res = await cloudProxy("GET", "/api/usage/current");
      if (res.ok) {
        const data = await res.json() as any;
        quotaCache = {
          plan: data.plan ?? "free",
          usage: data.usage ?? {},
          quota: data.quota ?? {},
          fetchedAt: Date.now(),
        };
        // Lazy capability recovery — if caps failed at startup but plan is Pro now
        if (!caps && data.plan === "pro") {
          const apiKey = await readApiKey();
          if (apiKey) {
            const { createCloudCapabilities } = await import("./cloud-capabilities");
            caps = createCloudCapabilities(
              apiKey,
              (counter, amount) => { try { usageQueries.increment(db, counter as any, amount); } catch {} },
              (method, path, status, duration, source) => { try { logQueries.insert(db, method, path, status, duration, source); } catch {} },
            );
            console.error("[LENS] Cloud capabilities recovered (Pro plan)");
          }
        }
      }
    } catch {}
  }

  const quotaTimer = setInterval(refreshQuotaCache, QUOTA_TTL);
  refreshQuotaCache().catch(() => {});

  // --- Telemetry Sync Timer (hourly, sync buffered events to cloud) ---

  const SYNC_INTERVAL = 60_000;

  async function syncTelemetryToCloud() {
    if (!isTelemetryEnabled()) return;
    const tid = getTelemetryId();
    if (!tid) return;

    const unsynced = telemetryQueries.getUnsynced(db, 500);
    if (unsynced.length === 0) return;

    // Read user_id from auth config if available
    const auth = readAuthSync();
    const userId = auth?.user_id ?? null;

    const events = unsynced.map((e) => ({
      event_type: e.event_type,
      event_data: e.event_data ? JSON.parse(e.event_data) : null,
      created_at: e.created_at,
    }));

    try {
      const res = await fetch(`${CLOUD_API_URL}/api/telemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telemetry_id: tid, user_id: userId, events }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        telemetryQueries.markSynced(db, unsynced.map((e) => e.id));
      }
    } catch {}

    // Prune old synced events
    telemetryQueries.prune(db);
  }

  const telemetrySyncTimer = setInterval(syncTelemetryToCloud, SYNC_INTERVAL);
  syncTelemetryToCloud().catch(() => {});
  app.stopTelemetrySync = () => {
    clearInterval(telemetrySyncTimer);
    clearInterval(quotaTimer);
  };

  return app;
}
