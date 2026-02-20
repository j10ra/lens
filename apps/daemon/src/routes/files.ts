import { lensRoute } from "@lens/core";
import { aggregateQueries, getEngineDb, importQueries, metadataQueries, statsQueries } from "@lens/engine";
import { Hono } from "hono";

export const filesRoutes = new Hono();

// GET /repos/:repoId/files — list files with metadata
filesRoutes.get(
  "/:repoId/files",
  lensRoute("files.list", async (c) => {
    const repoId = c.req.param("repoId")!;
    const limit = Number(c.req.query("limit") ?? "100");
    const offset = Number(c.req.query("offset") ?? "0");
    const search = c.req.query("search") || undefined;

    const db = getEngineDb();
    const { files, total } = aggregateQueries.filesList(db, repoId, { limit, offset, search });

    return c.json({
      files: files.map((f) => ({
        ...f,
        exports: JSON.parse(f.exports ?? "[]"),
      })),
      total,
    });
  }),
);

// GET /repos/:repoId/files/:filePath — full structural context for one file
filesRoutes.get(
  "/:repoId/files/:filePath{.+}",
  lensRoute("files.get", async (c) => {
    const repoId = c.req.param("repoId")!;
    const filePath = decodeURIComponent(c.req.param("filePath")!);

    const db = getEngineDb();

    const metadata = metadataQueries.getByRepoPath(db, repoId, filePath);
    if (!metadata) return c.json({ error: "file not found" }, 404);

    const importEdges = importQueries.getImports(db, repoId, filePath);
    const importedBy = importQueries.getImporters(db, repoId, filePath);
    const gitStats = statsQueries.getByPath(db, repoId, filePath);
    const rawCochanges = aggregateQueries.fileCochanges(db, repoId, filePath);
    const cochanges = rawCochanges.map((c) => ({
      path: c.path_a === filePath ? c.path_b : c.path_a,
      count: c.cochange_count,
    }));

    return c.json({
      path: metadata.path,
      language: metadata.language,
      exports: JSON.parse(metadata.exports ?? "[]"),
      imports: JSON.parse(metadata.imports ?? "[]"),
      docstring: metadata.docstring,
      sections: JSON.parse(metadata.sections ?? "[]"),
      internals: JSON.parse(metadata.internals ?? "[]"),
      symbols: JSON.parse(metadata.symbols ?? "[]"),
      import_edges: importEdges,
      imported_by: importedBy,
      git_stats: gitStats
        ? {
            commits: gitStats.commit_count,
            recent_90d: gitStats.recent_count,
            last_modified: gitStats.last_modified,
          }
        : null,
      cochanges,
    });
  }),
);
