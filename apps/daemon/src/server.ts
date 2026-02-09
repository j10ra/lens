import { Hono } from "hono";
import { existsSync, readFileSync, writeFileSync, statSync, watch } from "node:fs";
import { join, extname } from "node:path";
import { homedir } from "node:os";
import type { Db } from "@lens/engine";
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

export function createApp(db: Db, dashboardDist?: string): Hono {
  const app = new Hono();

  // Collect registered route paths for /api/dashboard/routes
  const registeredRoutes: Array<{ method: string; path: string }> = [];
  function track(method: string, path: string) {
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

    // Don't log dashboard static file requests
    if (path.startsWith("/dashboard/") && !path.startsWith("/api/")) return;

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

  track("GET", "/health");
  app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

  // --- Repo ---

  track("POST", "/repo/register");
  app.post("/repo/register", async (c) => {
    try {
      const { root_path, name, remote_url } = await c.req.json();
      if (!root_path) return c.json({ error: "root_path required" }, 400);

      const result = registerRepo(db, root_path, name, remote_url);

      if (result.created) {
        runIndex(db, result.repo_id)
          .then(() => Promise.all([ensureEmbedded(db, result.repo_id), enrichPurpose(db, result.repo_id)]))
          .catch((e) => console.error("[LENS] post-register index failed:", e));
      }

      startWatcher(db, result.repo_id, root_path);
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  track("GET", "/repo/list");
  app.get("/repo/list", (c) => {
    try {
      return c.json({ repos: listRepos(db) });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  track("GET", "/repo/list/detailed");
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

  track("GET", "/repo/template");
  app.get("/repo/template", (c) => c.json({ content: TEMPLATE }));

  track("GET", "/repo/:id");
  app.get("/repo/:id", (c) => {
    try {
      const repo = getRepo(db, c.req.param("id"));
      return c.json(repo);
    } catch (e: any) {
      if (e.message === "repo not found") return c.json({ error: "repo not found" }, 404);
      return c.json({ error: e.message }, 500);
    }
  });

  track("DELETE", "/repo/:id");
  app.delete("/repo/:id", async (c) => {
    try {
      const id = c.req.param("id");
      await stopWatcher(id).catch(() => {});
      const result = removeRepo(db, id);
      return c.json(result);
    } catch (e: any) {
      if (e.message === "repo not found") return c.json({ error: "repo not found" }, 404);
      return c.json({ error: e.message }, 500);
    }
  });

  track("GET", "/repo/:id/status");
  app.get("/repo/:id/status", async (c) => {
    try {
      const status = await getRepoStatus(db, c.req.param("id"));
      return c.json(status);
    } catch (e: any) {
      if (e.message === "repo not found") return c.json({ error: "repo not found" }, 404);
      return c.json({ error: e.message }, 500);
    }
  });

  // --- Context ---

  track("POST", "/context");
  app.post("/context", async (c) => {
    try {
      const { repo_id, goal } = await c.req.json();
      if (!repo_id || !goal) return c.json({ error: "repo_id and goal required" }, 400);
      const result = await buildContext(db, repo_id, goal);
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // --- Index ---

  track("POST", "/index/run");
  app.post("/index/run", async (c) => {
    try {
      const { repo_id, force } = await c.req.json();
      if (!repo_id) return c.json({ error: "repo_id required" }, 400);
      const result = await runIndex(db, repo_id, undefined, force ?? false);
      Promise.all([ensureEmbedded(db, repo_id), enrichPurpose(db, repo_id)]).catch((e) =>
        console.error("[LENS] post-index embed/enrich failed:", e),
      );
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  track("GET", "/index/status/:repo_id");
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
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  track("POST", "/index/watch");
  app.post("/index/watch", async (c) => {
    try {
      const { repo_id } = await c.req.json();
      if (!repo_id) return c.json({ error: "repo_id required" }, 400);
      const repo = getRepo(db, repo_id);
      const result = startWatcher(db, repo_id, repo.root_path);
      return c.json(result);
    } catch (e: any) {
      if (e.message === "repo not found") return c.json({ error: "repo not found" }, 404);
      return c.json({ error: e.message }, 500);
    }
  });

  track("POST", "/index/unwatch");
  app.post("/index/unwatch", async (c) => {
    try {
      const { repo_id } = await c.req.json();
      if (!repo_id) return c.json({ error: "repo_id required" }, 400);
      const result = await stopWatcher(repo_id);
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  track("GET", "/index/watch-status/:repo_id");
  app.get("/index/watch-status/:repo_id", (c) => {
    try {
      return c.json(getWatcherStatus(c.req.param("repo_id")));
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // --- Daemon ---

  track("GET", "/daemon/stats");
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
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    };
  }

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

  track("GET", "/api/auth/events");
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

  track("GET", "/api/auth/status");
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

  // --- Dashboard API ---

  track("GET", "/api/dashboard/stats");
  app.get("/api/dashboard/stats", (c) => {
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
        uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  track("GET", "/api/dashboard/repos");
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
          last_indexed_at: r.last_indexed_at,
          last_indexed_commit: r.last_indexed_commit,
          max_import_depth: r.max_import_depth,
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

  track("GET", "/api/dashboard/repos/:id");
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
      return c.json({
        ...repo,
        ...stats,
        ...structural,
        current_head: currentHead,
        is_stale: !!(currentHead && repo.last_indexed_commit !== currentHead),
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

  track("GET", "/api/dashboard/logs");
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

  track("GET", "/api/dashboard/tables");
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

  track("GET", "/api/dashboard/tables/:name");
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

  track("GET", "/api/dashboard/jobs");
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

  track("GET", "/api/dashboard/routes");
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

  return app;
}
