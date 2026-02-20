import { lensRoute } from "@lens/core";
import { aggregateQueries, getEngineDb, listRepos, registerRepo, removeRepo, runIndex } from "@lens/engine";
import { Hono } from "hono";

export const reposRoutes = new Hono();

// POST /repos — register a repo
reposRoutes.post(
  "/",
  lensRoute("repos.register", async (c) => {
    const { path, name } = await c.req.json();
    if (!path) return c.json({ error: "path is required" }, 400);

    try {
      const repo = await registerRepo(getEngineDb(), path, name);
      return c.json(repo, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  }),
);

// GET /repos — list all registered repos (enriched with file counts)
reposRoutes.get(
  "/",
  lensRoute("repos.list", async (c) => {
    const db = getEngineDb();
    const repos = await listRepos(db);
    const fileCounts = aggregateQueries.repoFileCounts(db);
    return c.json(repos.map((r) => ({ ...r, file_count: fileCounts[r.id] ?? 0 })));
  }),
);

// DELETE /repos/:id — remove a repo and cascade deletes
reposRoutes.delete(
  "/:id",
  lensRoute("repos.remove", async (c) => {
    const id = c.req.param("id") as string;
    const result = await removeRepo(getEngineDb(), id);
    if (!result.removed) return c.json({ error: "Repo not found" }, 404);
    return c.json({ removed: true });
  }),
);

// GET /repos/:id/stats — per-repo aggregate stats
reposRoutes.get(
  "/:id/stats",
  lensRoute("repos.stats", async (c) => {
    const id = c.req.param("id") as string;
    const db = getEngineDb();
    const languages = aggregateQueries.repoLanguageCounts(db, id);
    const imports = aggregateQueries.repoImportCount(db, id);
    return c.json({ languages, import_edges: imports });
  }),
);

// POST /repos/:id/index — trigger reindex
reposRoutes.post(
  "/:id/index",
  lensRoute("repos.index", async (c) => {
    const id = c.req.param("id") as string;
    const body = await c.req.json().catch(() => ({}));
    const force: boolean = body.force ?? false;

    try {
      const result = await runIndex(getEngineDb(), id, force);
      return c.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not found")) return c.json({ error: msg }, 404);
      return c.json({ error: msg }, 500);
    }
  }),
);
