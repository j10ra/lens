import { lensRoute } from "@lens/core";
import { ensureIndex, getEngineDb, grepRepo, listRepos } from "@lens/engine";
import { Hono } from "hono";

export const grepRoutes = new Hono();

grepRoutes.post(
  "/",
  lensRoute("grep.post", async (c) => {
    const { repoPath, query, limit = 20 } = await c.req.json();

    const db = getEngineDb();
    const repos = await listRepos(db);
    const repo = repos.find((r) => r.root_path === repoPath || r.root_path === repoPath?.replace(/\/$/, ""));

    if (!repo) {
      return c.json(
        {
          error: "Repo not registered",
          hint: 'Register with POST /repos { path: "..." } then POST /repos/:id/index',
        },
        404,
      );
    }

    // Auto-reindex if HEAD moved since last index
    await ensureIndex(db, repo.id);

    const result = await grepRepo(db, repo.id, query, limit);
    return c.json(result);
  }),
);
