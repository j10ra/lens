import { lensRoute } from "@lens/core";
import {
  buildFileNeighbors,
  buildGraphDetail,
  buildGraphOverview,
  buildGraphSummary,
  getEngineDb,
  listRepos,
} from "@lens/engine";
import { Hono } from "hono";

export const graphRoutes = new Hono();

graphRoutes.post(
  "/",
  lensRoute("graph.post", async (c) => {
    const { repoPath, dir, mode, limit, minCochangeWeight } = await c.req.json();
    const hasDir = typeof dir === "string";
    const normalizedDir = hasDir ? dir.trim() : undefined;

    const db = getEngineDb();
    const repos = await listRepos(db);
    const repo = repos.find((r) => r.root_path === repoPath || r.root_path === repoPath?.replace(/\/$/, ""));

    if (!repo) {
      return c.json({ error: "Repo not registered", hint: "Register with: lens register <path>" }, 404);
    }

    if (hasDir) {
      if (mode === "overview") {
        const overview = await buildGraphOverview(db, repo.id, normalizedDir ?? "", {
          limit: typeof limit === "number" ? limit : undefined,
          minCochangeWeight: typeof minCochangeWeight === "number" ? minCochangeWeight : undefined,
        });
        return c.json(overview);
      }
      const detail = await buildGraphDetail(db, repo.id, normalizedDir ?? "");
      return c.json(detail);
    }

    const summary = await buildGraphSummary(db, repo.id);
    return c.json(summary);
  }),
);

graphRoutes.post(
  "/neighbors",
  lensRoute("graph.neighbors", async (c) => {
    const { repoPath, path, cochangeLimit } = await c.req.json();

    const db = getEngineDb();
    const repos = await listRepos(db);
    const repo = repos.find((r) => r.root_path === repoPath || r.root_path === repoPath?.replace(/\/$/, ""));

    if (!repo) {
      return c.json({ error: "Repo not registered", hint: "Register with: lens register <path>" }, 404);
    }

    const result = await buildFileNeighbors(db, repo.id, path, {
      cochangeLimit: typeof cochangeLimit === "number" ? cochangeLimit : undefined,
    });

    if (!result) {
      return c.json({ error: "File not found in index", path }, 404);
    }

    return c.json(result);
  }),
);
