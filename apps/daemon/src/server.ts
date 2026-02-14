import { existsSync, readFileSync, statSync, watch, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import type { Capabilities, Db } from "@lens/engine";
import {
  buildContext,
  buildVocabClusters,
  chunkQueries,
  enrichPurpose,
  ensureEmbedded,
  getHeadCommit,
  getRawDb,
  getRepo,
  getRepoStatus,
  getWatcherStatus,
  importQueries,
  listRepos,
  logQueries,
  metadataQueries,
  RequestTrace,
  registerRepo,
  removeRepo,
  repoQueries,
  runEval,
  runIndex,
  setTelemetryEnabled,
  startWatcher,
  statsQueries,
  stopWatcher,
  telemetryQueries,
  track,
  usageQueries,
} from "@lens/engine";
import { Hono } from "hono";
import { ensureTelemetryId, getCloudUrl, getTelemetryId, isTelemetryEnabled } from "./config";

declare module "hono" {
  interface ContextVariableMap {
    trace: RequestTrace;
  }
}

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
  subscription: Record<string, unknown> | null;
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
    quotaCache = { ...initialPlanData, subscription: null, fetchedAt: Date.now() };
  }
  const app = new Hono() as Hono & { stopTelemetrySync?: () => void };

  // --- Telemetry Init ---
  const telemetryEnabled = isTelemetryEnabled();
  setTelemetryEnabled(telemetryEnabled);
  const { first_run } = ensureTelemetryId();

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
    const path = new URL(c.req.url).pathname;

    if (
      path.startsWith("/dashboard/") ||
      path.startsWith("/api/dashboard/") ||
      path === "/health" ||
      path.endsWith("/events")
    ) {
      return next();
    }

    const trace = new RequestTrace();
    c.set("trace", trace);

    // Capture request body for non-GET methods
    let reqBody: string | undefined;
    if (c.req.method !== "GET") {
      try {
        reqBody = await c.req.raw.clone().text();
      } catch {}
    }

    await next();

    const duration = Math.round(performance.now() - start);
    const source = deriveSource(c.req.raw, path);
    const traceData = trace.toJSON().length > 0 ? trace.serialize() : undefined;

    // Capture response body + size
    let resBody: string | undefined;
    let resSize: number | undefined;
    try {
      resBody = await c.res.clone().text();
      resSize = resBody.length;
    } catch {}

    try {
      logQueries.insert(db, c.req.method, path, c.res.status, duration, source, reqBody, resSize, resBody, traceData);
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
  app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0", cloud_url: CLOUD_API_URL }));

  // --- Telemetry Track (for CLI) ---

  trackRoute("POST", "/telemetry/track");
  app.post("/telemetry/track", async (c) => {
    try {
      if (!isTelemetryEnabled()) return c.json({ ok: true, skipped: true });
      const trace = c.get("trace");
      const { event_type, event_data } = await c.req.json();
      if (!event_type || typeof event_type !== "string") return c.json({ error: "event_type required" }, 400);
      trace.step("track");
      track(db, event_type, event_data);
      trace.end("track", event_type);
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: true });
    }
  });

  // --- Repo ---

  trackRoute("POST", "/repo/register");
  app.post("/repo/register", async (c) => {
    try {
      const trace = c.get("trace");
      const { root_path, name, remote_url } = await c.req.json();
      if (!root_path) return c.json({ error: "root_path required" }, 400);

      // Registration limit check
      trace.step("quotaCheck");
      const currentRepos = listRepos(db).length;
      const maxRepos = quotaCache?.quota?.maxRepos ?? 50;
      trace.end("quotaCheck", `${currentRepos}/${maxRepos}`);
      if (currentRepos >= maxRepos) {
        return c.json(
          {
            error: "Repo limit reached",
            current: currentRepos,
            limit: maxRepos,
            plan: quotaCache?.plan ?? "unknown",
          },
          429,
        );
      }

      trace.step("registerRepo");
      const result = registerRepo(db, root_path, name, remote_url);
      trace.end("registerRepo", result.created ? "created" : "existing");

      if (result.created) {
        runIndex(db, result.repo_id, caps, false, emitRepoEvent)
          .then(async (r) => {
            const bg = new RequestTrace();
            const bgStart = performance.now();
            const results: Record<string, unknown> = { index: r };
            bg.add("index", r.duration_ms, `${r.files_scanned} files, +${r.chunks_created} chunks`);
            if (r.files_scanned > 0) usageQueries.increment(db, "repos_indexed");
            const repo = repoQueries.getById(db, result.repo_id);
            const reqBody = JSON.stringify({ repo_id: result.repo_id, repo_name: repo?.name });
            const tasks: Promise<any>[] = [];
            if (repo?.enable_vocab_clusters && quotaRemaining("embeddingChunks") > 0) {
              bg.step("vocabClusters");
              tasks.push(
                buildVocabClusters(db, result.repo_id, caps).then(() => {
                  bg.end("vocabClusters");
                  results.vocabClusters = "done";
                }),
              );
            } else {
              bg.add("vocabClusters", 0, !repo?.enable_vocab_clusters ? "disabled" : "quota exceeded");
            }
            if (repo?.enable_embeddings && quotaRemaining("embeddingChunks") > 0) {
              bg.step("embeddings");
              tasks.push(
                ensureEmbedded(db, result.repo_id, caps).then((er) => {
                  bg.end("embeddings", `${er.embedded_count} embedded`);
                  results.embeddings = er;
                }),
              );
            } else {
              bg.add("embeddings", 0, !repo?.enable_embeddings ? "disabled" : "quota exceeded");
            }
            if (repo?.enable_summaries && quotaRemaining("purposeRequests") > 0) {
              bg.step("purpose");
              tasks.push(
                enrichPurpose(db, result.repo_id, caps).then((pr) => {
                  bg.end("purpose", `${pr.enriched} enriched`);
                  results.purpose = pr;
                }),
              );
            } else {
              bg.add("purpose", 0, !repo?.enable_summaries ? "disabled" : "quota exceeded");
            }
            await Promise.all(tasks);
            const resBody = JSON.stringify(results);
            const bgDuration = Math.round(performance.now() - bgStart);
            logQueries.insert(
              db,
              "BG",
              `/enrichment/${result.repo_id}`,
              200,
              bgDuration,
              "system",
              reqBody,
              resBody.length,
              resBody,
              bg.serialize(),
            );
          })
          .catch((e) => {
            logQueries.insert(
              db,
              "BG",
              `/enrichment/${result.repo_id}`,
              500,
              0,
              "system",
              JSON.stringify({ repo_id: result.repo_id }),
              undefined,
              String(e),
            );
          });
      }

      trace.step("startWatcher");
      startWatcher(db, result.repo_id, root_path);
      trace.end("startWatcher");
      emitRepoEvent();
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/repo/list");
  app.get("/repo/list", (c) => {
    try {
      const trace = c.get("trace");
      trace.step("listRepos");
      const repos = listRepos(db);
      trace.end("listRepos", `${repos.length} repos`);
      return c.json({ repos });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/repo/list/detailed");
  app.get("/repo/list/detailed", (c) => {
    try {
      const trace = c.get("trace");
      trace.step("listRepos");
      const repos = listRepos(db);
      trace.end("listRepos", `${repos.length} repos`);
      trace.step("loadStats");
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
      trace.end("loadStats");
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
      const trace = c.get("trace");
      trace.step("getRepo");
      const repo = getRepo(db, c.req.param("id"));
      trace.end("getRepo");
      return c.json(repo);
    } catch (e: any) {
      if (e.message === "repo not found") return c.json({ error: "repo not found" }, 404);
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("DELETE", "/repo/:id");
  app.delete("/repo/:id", async (c) => {
    try {
      const trace = c.get("trace");
      const id = c.req.param("id");
      trace.step("stopWatcher");
      await stopWatcher(id).catch(() => {});
      trace.end("stopWatcher");
      trace.step("removeRepo");
      const result = removeRepo(db, id);
      trace.end("removeRepo");
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
      const trace = c.get("trace");
      trace.step("getRepoStatus");
      const status = await getRepoStatus(db, c.req.param("id"));
      trace.end("getRepoStatus");
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
      const repo = repoQueries.getById(db, repo_id);
      const useEmbeddings = repo?.enable_embeddings === 1;
      const result = await buildContext(db, repo_id, goal, caps, c.get("trace"), { useEmbeddings });
      usageQueries.increment(db, "context_queries");
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // --- Eval ---

  trackRoute("POST", "/eval/run");
  app.post("/eval/run", async (c) => {
    try {
      const trace = c.get("trace");
      const { repo_id, filter_kind } = await c.req.json();
      if (!repo_id) return c.json({ error: "repo_id required" }, 400);
      trace.step("runEval");
      const summary = await runEval(db, repo_id, { filterKind: filter_kind });
      trace.end("runEval", `${summary.total} queries`);
      return c.json(summary);
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
      const result = await runIndex(db, repo_id, caps, force ?? false, emitRepoEvent, c.get("trace"));
      if (result.files_scanned > 0) usageQueries.increment(db, "repos_indexed");

      const repo = repoQueries.getById(db, repo_id);
      const bg = new RequestTrace();
      const bgStart = performance.now();
      const results: Record<string, unknown> = { index: result };
      const reqBody = JSON.stringify({ repo_id, repo_name: repo?.name, force });
      const tasks: Promise<any>[] = [];
      if (repo?.enable_vocab_clusters && quotaRemaining("embeddingChunks") > 0) {
        bg.step("vocabClusters");
        tasks.push(
          buildVocabClusters(db, repo_id, caps).then(() => {
            bg.end("vocabClusters");
            results.vocabClusters = "done";
          }),
        );
      } else {
        bg.add("vocabClusters", 0, !repo?.enable_vocab_clusters ? "disabled" : "quota exceeded");
      }
      if (repo?.enable_embeddings && quotaRemaining("embeddingChunks") > 0) {
        bg.step("embeddings");
        tasks.push(
          ensureEmbedded(db, repo_id, caps).then((er) => {
            bg.end("embeddings", `${er.embedded_count} embedded`);
            results.embeddings = er;
          }),
        );
      } else {
        bg.add("embeddings", 0, !repo?.enable_embeddings ? "disabled" : "quota exceeded");
      }
      if (repo?.enable_summaries && quotaRemaining("purposeRequests") > 0) {
        bg.step("purpose");
        tasks.push(
          enrichPurpose(db, repo_id, caps).then((pr) => {
            bg.end("purpose", `${pr.enriched} enriched`);
            results.purpose = pr;
          }),
        );
      } else {
        bg.add("purpose", 0, !repo?.enable_summaries ? "disabled" : "quota exceeded");
      }
      Promise.all(tasks)
        .then(() => {
          const resBody = JSON.stringify(results);
          const bgDuration = Math.round(performance.now() - bgStart);
          logQueries.insert(
            db,
            "BG",
            `/enrichment/${repo_id}`,
            200,
            bgDuration,
            "system",
            reqBody,
            resBody.length,
            resBody,
            bg.serialize(),
          );
        })
        .catch((e) => {
          logQueries.insert(db, "BG", `/enrichment/${repo_id}`, 500, 0, "system", reqBody, undefined, String(e));
        });

      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/index/status/:repo_id");
  app.get("/index/status/:repo_id", async (c) => {
    try {
      const trace = c.get("trace");
      const repoId = c.req.param("repo_id");
      trace.step("getRepo");
      const repo = repoQueries.getById(db, repoId);
      trace.end("getRepo");
      if (!repo) return c.json({ error: "repo not found" }, 404);

      trace.step("getHeadCommit");
      let currentHead: string | null = null;
      try {
        currentHead = await getHeadCommit(repo.root_path);
      } catch {}
      trace.end("getHeadCommit");

      const isStale = !!(currentHead && repo.last_indexed_commit !== currentHead);
      trace.step("getStats");
      const stats = chunkQueries.getStats(db, repoId);
      trace.end("getStats");

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
      const trace = c.get("trace");
      const { repo_id } = await c.req.json();
      if (!repo_id) return c.json({ error: "repo_id required" }, 400);
      trace.step("getRepo");
      const repo = getRepo(db, repo_id);
      trace.end("getRepo");
      trace.step("startWatcher");
      const result = startWatcher(db, repo_id, repo.root_path);
      trace.end("startWatcher");
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
      const trace = c.get("trace");
      const { repo_id } = await c.req.json();
      if (!repo_id) return c.json({ error: "repo_id required" }, 400);
      trace.step("stopWatcher");
      const result = await stopWatcher(repo_id);
      trace.end("stopWatcher");
      emitRepoEvent();
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/index/watch-status/:repo_id");
  app.get("/index/watch-status/:repo_id", (c) => {
    try {
      const trace = c.get("trace");
      trace.step("getWatcherStatus");
      const status = getWatcherStatus(c.req.param("repo_id"));
      trace.end("getWatcherStatus");
      return c.json(status);
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // --- Daemon ---

  trackRoute("GET", "/daemon/stats");
  app.get("/daemon/stats", (c) => {
    try {
      const trace = c.get("trace");
      trace.step("listRepos");
      const repos = listRepos(db);
      trace.end("listRepos", `${repos.length} repos`);
      let totalChunks = 0;
      let totalEmbeddings = 0;
      trace.step("aggregateStats");
      for (const r of repos) {
        const s = chunkQueries.getStats(db, r.id);
        totalChunks += s.chunk_count;
        totalEmbeddings += s.embedded_count;
      }
      trace.end("aggregateStats");
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
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in?: number;
      user?: { id: string; email?: string };
    };
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
      try {
        ctrl.enqueue(encoder.encode("data: repo-changed\n\n"));
      } catch {
        repoClients.delete(ctrl);
      }
    }
  }

  trackRoute("GET", "/api/repo/events");
  app.get("/api/repo/events", (_c) => {
    const stream = new ReadableStream({
      start(ctrl) {
        repoClients.add(ctrl);
      },
      cancel() {
        /* cleaned up on next failed enqueue */
      },
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

  function emitAuthEvent() {
    for (const ctrl of authClients) {
      try {
        ctrl.enqueue(encoder.encode("data: auth-changed\n\n"));
      } catch {
        authClients.delete(ctrl);
      }
    }
  }

  try {
    watch(authDir, (_, filename) => {
      // filename can be null on macOS — emit if null or auth.json
      if (filename && filename !== "auth.json") return;
      // Refresh quota THEN emit SSE — dashboard gets fresh plan data
      refreshQuotaCache()
        .then(() => emitAuthEvent())
        .catch(() => emitAuthEvent());
    });
  } catch {}

  trackRoute("GET", "/api/auth/events");
  app.get("/api/auth/events", (_c) => {
    const stream = new ReadableStream({
      start(ctrl) {
        authClients.add(ctrl);
      },
      cancel() {
        /* cleaned up on next failed enqueue */
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  trackRoute("POST", "/api/auth/notify");
  app.post("/api/auth/notify", async (c) => {
    await refreshQuotaCache();
    emitAuthEvent();
    return c.json({ ok: true });
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

  async function provisionApiKey(): Promise<string | null> {
    const authPath = join(homedir(), ".lens", "auth.json");
    try {
      const data = JSON.parse(readFileSync(authPath, "utf-8"));
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

  async function readApiKey(): Promise<string | null> {
    const authPath = join(homedir(), ".lens", "auth.json");
    try {
      const data = JSON.parse(readFileSync(authPath, "utf-8"));
      if (data.api_key) return data.api_key;
      return provisionApiKey();
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
    const trace = c.get("trace");
    const start = c.req.query("start");
    const end = c.req.query("end");
    trace.step("cloudProxy");
    const res = await cloudProxy("GET", `/api/usage?start=${start}&end=${end}`);
    trace.end("cloudProxy", `${res.status}`);
    return res;
  });

  trackRoute("GET", "/api/cloud/usage/current");
  app.get("/api/cloud/usage/current", async (c) => {
    const trace = c.get("trace");
    trace.step("cloudProxy");
    const res = await cloudProxy("GET", "/api/usage/current");
    trace.end("cloudProxy", `${res.status}`);
    return res;
  });

  // Subscription (served from cache, refreshed every 5 min)
  trackRoute("GET", "/api/cloud/subscription");
  app.get("/api/cloud/subscription", (c) => {
    const sub = quotaCache?.subscription ?? { plan: "free", status: "active" };
    return c.json({ subscription: sub });
  });

  // Billing
  trackRoute("POST", "/api/cloud/billing/checkout");
  app.post("/api/cloud/billing/checkout", async (c) => {
    const trace = c.get("trace");
    const body = await c.req.json().catch(() => ({}));
    trace.step("cloudProxy");
    const res = await cloudProxy("POST", "/api/billing/checkout", body);
    trace.end("cloudProxy", `${res.status}`);
    return res;
  });

  trackRoute("GET", "/api/cloud/billing/portal");
  app.get("/api/cloud/billing/portal", async (c) => {
    const trace = c.get("trace");
    const returnUrl = c.req.query("return_url") || "";
    const qs = returnUrl ? `?return_url=${encodeURIComponent(returnUrl)}` : "";
    trace.step("cloudProxy");
    const res = await cloudProxy("GET", `/api/billing/portal${qs}`);
    trace.end("cloudProxy", `${res.status}`);
    return res;
  });

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
          enable_embeddings: r.enable_embeddings,
          enable_summaries: r.enable_summaries,
          enable_vocab_clusters: r.enable_vocab_clusters,
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
      try {
        currentHead = await getHeadCommit(repo.root_path);
      } catch {}
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

  trackRoute("PATCH", "/api/dashboard/repos/:id/settings");
  app.patch("/api/dashboard/repos/:id/settings", async (c) => {
    try {
      const id = c.req.param("id");
      const repo = repoQueries.getById(db, id);
      if (!repo) return c.json({ error: "repo not found" }, 404);
      const body = (await c.req.json()) as {
        enable_embeddings?: boolean;
        enable_summaries?: boolean;
        enable_vocab_clusters?: boolean;
      };
      const flags: { enable_embeddings?: number; enable_summaries?: number; enable_vocab_clusters?: number } = {};
      if (body.enable_embeddings !== undefined) flags.enable_embeddings = body.enable_embeddings ? 1 : 0;
      if (body.enable_summaries !== undefined) flags.enable_summaries = body.enable_summaries ? 1 : 0;
      if (body.enable_vocab_clusters !== undefined) flags.enable_vocab_clusters = body.enable_vocab_clusters ? 1 : 0;
      repoQueries.updateProFeatures(db, id, flags);
      emitRepoEvent();
      return c.json({ ok: true });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/api/dashboard/repos/:id/files");
  app.get("/api/dashboard/repos/:id/files", (c) => {
    try {
      const id = c.req.param("id");
      const repo = repoQueries.getById(db, id);
      if (!repo) return c.json({ error: "repo not found" }, 404);
      const limit = Number(c.req.query("limit") || 100);
      const offset = Number(c.req.query("offset") || 0);
      const search = c.req.query("search") || undefined;
      const meta = metadataQueries.getByRepo(db, id);
      const raw = getRawDb();
      const chunkCounts = raw
        .prepare(
          "SELECT path, count(*) as chunk_count, SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as embedded_count FROM chunks WHERE repo_id = ? GROUP BY path",
        )
        .all(id) as Array<{ path: string; chunk_count: number; embedded_count: number }>;
      const countMap = new Map(chunkCounts.map((r) => [r.path, r]));
      let all = meta.map((m) => {
        const counts = countMap.get(m.path);
        return {
          path: m.path,
          language: m.language,
          exports: m.exports,
          purpose: m.purpose,
          chunk_count: counts?.chunk_count ?? 0,
          has_embedding: (counts?.embedded_count ?? 0) > 0,
        };
      });
      if (search) {
        const q = search.toLowerCase();
        all = all.filter((f) => f.path.toLowerCase().includes(q));
      }
      const total = all.length;
      const files = all.slice(offset, offset + limit);
      return c.json({ files, total });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/api/dashboard/repos/:id/files/:path");
  app.get("/api/dashboard/repos/:id/files/:path", (c) => {
    try {
      const id = c.req.param("id");
      const filePath = decodeURIComponent(c.req.param("path"));
      const repo = repoQueries.getById(db, id);
      if (!repo) return c.json({ error: "repo not found" }, 404);

      // Metadata
      const allMeta = metadataQueries.getByRepo(db, id);
      const meta = allMeta.find((m) => m.path === filePath);
      if (!meta) return c.json({ error: "file not found" }, 404);

      // Chunk stats
      const raw = getRawDb();
      const chunkRow = raw
        .prepare(
          "SELECT count(*) as chunk_count, SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as embedded_count FROM chunks WHERE repo_id = ? AND path = ?",
        )
        .get(id, filePath) as { chunk_count: number; embedded_count: number };

      // Import graph: what this file imports + what imports this file
      const allImports = importQueries.getBySources(db, id, [filePath]);
      const allImporters = importQueries.getByTargets(db, id, [filePath]);

      // Git stats
      const gitStats = statsQueries.getByRepo(db, id);
      const fileStat = gitStats.get(filePath);

      // Co-changes (top 10 by count)
      const cochangeRows = raw
        .prepare(
          "SELECT path_a, path_b, cochange_count FROM file_cochanges WHERE repo_id = ? AND (path_a = ? OR path_b = ?) ORDER BY cochange_count DESC LIMIT 10",
        )
        .all(id, filePath, filePath) as Array<{ path_a: string; path_b: string; cochange_count: number }>;
      const cochanges = cochangeRows.map((r) => ({
        path: r.path_a === filePath ? r.path_b : r.path_a,
        count: r.cochange_count,
      }));

      return c.json({
        path: meta.path,
        language: meta.language,
        exports: meta.exports,
        docstring: meta.docstring,
        sections: meta.sections,
        internals: meta.internals,
        purpose: meta.purpose,
        chunk_count: chunkRow.chunk_count,
        embedded_count: chunkRow.embedded_count,
        imports: allImports.map((i) => i.target_path),
        imported_by: allImporters.map((i) => i.source_path),
        git: fileStat
          ? {
              commit_count: fileStat.commit_count,
              recent_count: fileStat.recent_count,
              last_modified: fileStat.last_modified?.toISOString() ?? null,
            }
          : null,
        cochanges,
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/api/dashboard/repos/:id/chunks");
  app.get("/api/dashboard/repos/:id/chunks", (c) => {
    try {
      const id = c.req.param("id");
      const repo = repoQueries.getById(db, id);
      if (!repo) return c.json({ error: "repo not found" }, 404);
      const limit = Number(c.req.query("limit") || 100);
      const offset = Number(c.req.query("offset") || 0);
      const pathFilter = c.req.query("path") || undefined;
      const raw = getRawDb();
      const where = pathFilter ? "WHERE repo_id = ? AND path = ?" : "WHERE repo_id = ?";
      const params = pathFilter ? [id, pathFilter] : [id];
      const rows = raw
        .prepare(
          `SELECT id, path, chunk_index, start_line, end_line, language, CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END as has_embedding FROM chunks ${where} ORDER BY path, chunk_index LIMIT ? OFFSET ?`,
        )
        .all(...params, limit, offset) as Array<{
        id: string;
        path: string;
        chunk_index: number;
        start_line: number;
        end_line: number;
        language: string | null;
        has_embedding: number;
      }>;
      const totalRow = raw.prepare(`SELECT count(*) as count FROM chunks ${where}`).get(...params) as { count: number };
      return c.json({
        chunks: rows.map((r) => ({ ...r, has_embedding: r.has_embedding === 1 })),
        total: totalRow.count,
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/api/dashboard/repos/:id/chunks/:chunkId");
  app.get("/api/dashboard/repos/:id/chunks/:chunkId", (c) => {
    try {
      const id = c.req.param("id");
      const chunkId = c.req.param("chunkId");
      const raw = getRawDb();
      const row = raw
        .prepare(
          "SELECT id, path, chunk_index, start_line, end_line, content, language, chunk_hash, CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END as has_embedding FROM chunks WHERE id = ? AND repo_id = ?",
        )
        .get(chunkId, id) as
        | {
            id: string;
            path: string;
            chunk_index: number;
            start_line: number;
            end_line: number;
            content: string;
            language: string | null;
            chunk_hash: string;
            has_embedding: number;
          }
        | undefined;
      if (!row) return c.json({ error: "chunk not found" }, 404);
      return c.json({ ...row, has_embedding: row.has_embedding === 1 });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  trackRoute("GET", "/api/dashboard/repos/:id/vocab-clusters");
  app.get("/api/dashboard/repos/:id/vocab-clusters", (c) => {
    try {
      const id = c.req.param("id");
      const repo = repoQueries.getById(db, id);
      if (!repo) return c.json({ error: "repo not found" }, 404);
      const clusters = repo.vocab_clusters ? JSON.parse(repo.vocab_clusters) : [];
      return c.json({ clusters: Array.isArray(clusters) ? clusters : [] });
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
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
        )
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
      const tableCheck = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
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

  trackRoute("POST", "/api/dashboard/refresh-plan");
  app.post("/api/dashboard/refresh-plan", async (c) => {
    try {
      await refreshQuotaCache();
      return c.json({
        plan: quotaCache?.plan ?? "free",
        has_capabilities: !!caps,
        refreshed_at: quotaCache?.fetchedAt ?? null,
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
        const isHtml = mime === "text/html";
        return new Response(content, {
          headers: {
            "Content-Type": mime,
            "Cache-Control": isHtml ? "no-cache" : "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // SPA fallback
      const indexPath = join(dashboardDist, "index.html");
      if (existsSync(indexPath)) {
        return new Response(readFileSync(indexPath), {
          headers: { "Content-Type": "text/html", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" },
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
      const [res, subRes] = await Promise.all([
        cloudProxy("GET", "/api/usage/current"),
        cloudProxy("GET", "/api/subscription"),
      ]);
      if (res.ok) {
        const data = (await res.json()) as any;
        const plan = (data.plan ?? "free").trim();
        const subData = subRes.ok ? (((await subRes.json()) as any).subscription ?? null) : null;
        quotaCache = {
          plan,
          usage: data.usage ?? {},
          quota: data.quota ?? {},
          subscription: subData,
          fetchedAt: Date.now(),
        };
        // Clear capabilities on downgrade
        if (caps && plan !== "pro") {
          caps = undefined;
          console.error("[LENS] Cloud capabilities disabled (plan changed to free)");
        }
        // Lazy capability recovery — if caps failed at startup but plan is Pro now
        if (!caps && plan === "pro") {
          const apiKey = await readApiKey();
          if (apiKey) {
            const { createCloudCapabilities } = await import("./cloud-capabilities");
            caps = createCloudCapabilities(
              () => readApiKey(),
              provisionApiKey,
              (counter, amount) => {
                try {
                  usageQueries.increment(db, counter as any, amount);
                } catch {}
              },
              (method, path, status, duration, source, reqBody, resBody) => {
                try {
                  logQueries.insert(db, method, path, status, duration, source, reqBody, resBody?.length, resBody);
                } catch {}
              },
            );
            console.error("[LENS] Cloud capabilities recovered (Pro plan)");
          }
        }
      } else if (res.status === 401) {
        // Key revoked or invalid — try re-provisioning
        const newKey = await provisionApiKey();
        if (newKey) {
          console.error("[LENS] API key re-provisioned after 401");
          return refreshQuotaCache(); // Retry with new key
        }
        quotaCache = { plan: "free", usage: {}, quota: {}, subscription: null, fetchedAt: Date.now() };
        caps = undefined;
      } else {
        // Other failure (5xx, etc.) — reset to free so stale Pro doesn't persist
        quotaCache = { plan: "free", usage: {}, quota: {}, subscription: null, fetchedAt: Date.now() };
        caps = undefined;
      }
    } catch {
      // Network error — also reset to prevent stale Pro
      quotaCache = { plan: "free", usage: {}, quota: {}, subscription: null, fetchedAt: Date.now() };
      caps = undefined;
    }
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
        telemetryQueries.markSynced(
          db,
          unsynced.map((e) => e.id),
        );
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
