import { Hono } from "hono";
import { statSync } from "node:fs";
import { join } from "node:path";
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
  ensureEmbedded,
  enrichPurpose,
} from "@lens/engine";

const TEMPLATE = `<!-- LENS — Repo Context Daemon -->
## LENS Context

This repo is indexed by LENS. Use the MCP context tool or run:
\`\`\`
lens context "<your goal>"
\`\`\``;

function getDbSizeMb(): number {
  const dbPath = join(homedir(), ".lens", "data.db");
  try {
    return Math.round((statSync(dbPath).size / 1024 / 1024) * 10) / 10;
  } catch {
    return 0;
  }
}

export function createApp(db: Db): Hono {
  const app = new Hono();

  // --- Health ---

  app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

  // --- Repo ---

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

  app.get("/repo/list", (c) => {
    try {
      return c.json({ repos: listRepos(db) });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

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

  app.get("/repo/template", (c) => c.json({ content: TEMPLATE }));

  app.get("/repo/:id", (c) => {
    try {
      const repo = getRepo(db, c.req.param("id"));
      return c.json(repo);
    } catch (e: any) {
      if (e.message === "repo not found") return c.json({ error: "repo not found" }, 404);
      return c.json({ error: e.message }, 500);
    }
  });

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

  app.get("/index/watch-status/:repo_id", (c) => {
    try {
      return c.json(getWatcherStatus(c.req.param("repo_id")));
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // --- Daemon ---

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

  return app;
}
