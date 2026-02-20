import { lensRoute } from "@lens/core";
import { buildGraphDetail, buildGraphSummary, getEngineDb, listRepos } from "@lens/engine";
import { Hono } from "hono";

export const graphRoutes = new Hono();

graphRoutes.post(
  "/",
  lensRoute("graph.post", async (c) => {
    const { repoPath, dir } = await c.req.json();

    const db = getEngineDb();
    const repos = await listRepos(db);
    const repo = repos.find((r) => r.root_path === repoPath || r.root_path === repoPath?.replace(/\/$/, ""));

    if (!repo) {
      return c.json({ error: "Repo not registered", hint: "Register with: lens register <path>" }, 404);
    }

    if (dir != null) {
      const detail = await buildGraphDetail(db, repo.id, dir);
      return c.json(detail);
    }

    const summary = await buildGraphSummary(db, repo.id);
    return c.json(summary);
  }),
);
