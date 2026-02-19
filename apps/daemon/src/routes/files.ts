import { lensRoute } from "@lens/core";
import { getRawDb } from "@lens/engine";
import { Hono } from "hono";

export const filesRoutes = new Hono();

// GET /repos/:repoId/files — list files with metadata
filesRoutes.get(
  "/:repoId/files",
  lensRoute("files.list", async (c) => {
    const repoId = c.req.param("repoId");
    const limit = Number(c.req.query("limit") ?? "100");
    const offset = Number(c.req.query("offset") ?? "0");
    const search = c.req.query("search") ?? "";

    const db = getRawDb();

    const searchClause = search ? "AND fm.path LIKE ?" : "";
    const params: (string | number)[] = search ? [repoId, `%${search}%`, limit, offset] : [repoId, limit, offset];

    const files = db
      .prepare(
        `SELECT fm.path, fm.language, fm.exports,
                COUNT(DISTINCT fi.id) AS import_count
         FROM file_metadata fm
         LEFT JOIN file_imports fi ON fi.repo_id = fm.repo_id AND fi.source_path = fm.path
         WHERE fm.repo_id = ? ${searchClause}
         GROUP BY fm.path
         ORDER BY fm.path ASC
         LIMIT ? OFFSET ?`,
      )
      .all(...params) as Array<{
      path: string;
      language: string | null;
      exports: string;
      import_count: number;
    }>;

    const countRow = db
      .prepare(`SELECT COUNT(*) AS total FROM file_metadata WHERE repo_id = ?${search ? " AND path LIKE ?" : ""}`)
      .get(...(search ? [repoId, `%${search}%`] : [repoId])) as { total: number };

    return c.json({
      files: files.map((f) => ({
        ...f,
        exports: JSON.parse(f.exports ?? "[]"),
      })),
      total: countRow.total,
    });
  }),
);

// GET /repos/:repoId/files/:filePath — full structural context for one file
filesRoutes.get(
  "/:repoId/files/:filePath{.+}",
  lensRoute("files.get", async (c) => {
    const repoId = c.req.param("repoId");
    const filePath = decodeURIComponent(c.req.param("filePath"));

    const db = getRawDb();

    const metadata = db.prepare("SELECT * FROM file_metadata WHERE repo_id = ? AND path = ?").get(repoId, filePath) as
      | {
          path: string;
          language: string | null;
          exports: string;
          imports: string;
          docstring: string;
          sections: string;
          internals: string;
        }
      | undefined;

    if (!metadata) return c.json({ error: "file not found" }, 404);

    const importEdges = db
      .prepare("SELECT target_path FROM file_imports WHERE repo_id = ? AND source_path = ?")
      .all(repoId, filePath) as Array<{ target_path: string }>;

    const importedBy = db
      .prepare("SELECT source_path FROM file_imports WHERE repo_id = ? AND target_path = ?")
      .all(repoId, filePath) as Array<{ source_path: string }>;

    const gitStats = db.prepare("SELECT * FROM file_stats WHERE repo_id = ? AND path = ?").get(repoId, filePath) as
      | { commit_count: number; recent_count: number; last_modified: string | null }
      | undefined;

    const cochanges = db
      .prepare(
        `SELECT path_a, path_b, cochange_count FROM file_cochanges
         WHERE repo_id = ? AND (path_a = ? OR path_b = ?)
         ORDER BY cochange_count DESC LIMIT 20`,
      )
      .all(repoId, filePath, filePath) as Array<{
      path_a: string;
      path_b: string;
      cochange_count: number;
    }>;

    return c.json({
      path: metadata.path,
      language: metadata.language,
      exports: JSON.parse(metadata.exports ?? "[]"),
      imports: JSON.parse(metadata.imports ?? "[]"),
      docstring: metadata.docstring,
      sections: JSON.parse(metadata.sections ?? "[]"),
      internals: JSON.parse(metadata.internals ?? "[]"),
      import_edges: importEdges.map((i) => i.target_path),
      imported_by: importedBy.map((i) => i.source_path),
      git_stats: gitStats ?? null,
      cochanges,
    });
  }),
);
