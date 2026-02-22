import { spawn, spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { lensRoute } from "@lens/core";
import { aggregateQueries, getEngineDb, importQueries, listRepos, metadataQueries, statsQueries } from "@lens/engine";
import { Hono } from "hono";

export const filesRoutes = new Hono();

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const int = Math.trunc(parsed);
  return int >= 1 ? int : undefined;
}

function isWithinRepo(repoRoot: string, absPath: string): boolean {
  const root = resolve(repoRoot);
  const target = resolve(absPath);
  return target === root || target.startsWith(root + sep);
}

async function fileExists(absPath: string): Promise<boolean> {
  try {
    await access(absPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function commandExists(command: string): boolean {
  const checker = process.platform === "win32" ? "where" : "which";
  try {
    const result = spawnSync(checker, [command], { stdio: "ignore" });
    return result.status === 0;
  } catch {
    return false;
  }
}

function spawnDetached(command: string, args: string[]): boolean {
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function shellQuote(input: string): string {
  return `'${input.replace(/'/g, `'"'"'`)}'`;
}

function openExternal(target: string): boolean {
  if (process.platform === "darwin") return spawnDetached("open", [target]);
  if (process.platform === "win32") return spawnDetached("cmd", ["/c", "start", "", target]);
  return spawnDetached("xdg-open", [target]);
}

function openWithConfiguredEditor(location: string): boolean {
  const editor = process.env.LENS_EDITOR?.trim();
  if (!editor) return false;

  if (process.platform === "win32") {
    const escaped = location.replace(/"/g, '\\"');
    return spawnDetached("cmd", ["/c", `${editor} "${escaped}"`]);
  }

  const shell = process.env.SHELL || "/bin/sh";
  return spawnDetached(shell, ["-lc", `${editor} ${shellQuote(location)}`]);
}

function openInEditor(absPath: string, line?: number, column?: number): { opened: boolean; strategy: string } {
  const safeLine = line ? Math.max(1, line) : undefined;
  const safeColumn = column ? Math.max(1, column) : 1;
  const location = safeLine ? `${absPath}:${safeLine}:${safeColumn}` : absPath;

  const editors = [
    { cmd: "code", args: safeLine ? ["-g", location] : [absPath] },
    { cmd: "cursor", args: safeLine ? ["-g", location] : [absPath] },
    { cmd: "windsurf", args: safeLine ? ["-g", location] : [absPath] },
    { cmd: "codium", args: safeLine ? ["-g", location] : [absPath] },
    { cmd: "subl", args: safeLine ? [`${absPath}:${safeLine}:${safeColumn}`] : [absPath] },
    { cmd: "zed", args: safeLine ? ["--line", String(safeLine), absPath] : [absPath] },
  ];

  for (const editor of editors) {
    if (!commandExists(editor.cmd)) continue;
    if (spawnDetached(editor.cmd, editor.args)) {
      return { opened: true, strategy: editor.cmd };
    }
  }

  if (openWithConfiguredEditor(location)) {
    return { opened: true, strategy: "env" };
  }

  if (safeLine) {
    const uriPath = absPath.replace(/\\/g, "/");
    if (openExternal(`vscode://file/${uriPath}:${safeLine}:${safeColumn}`)) {
      return { opened: true, strategy: "vscode-uri" };
    }
  }

  if (openExternal(absPath)) {
    return { opened: true, strategy: "default" };
  }

  return { opened: false, strategy: "none" };
}

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

// POST /repos/:repoId/open — open file in local editor (optional line/column)
filesRoutes.post(
  "/:repoId/open",
  lensRoute("files.open", async (c) => {
    const repoId = c.req.param("repoId")!;
    const body = await c.req.json().catch(() => ({}));

    const filePath = typeof body.filePath === "string" ? body.filePath.trim().replace(/^\/+/, "") : "";
    if (!filePath) return c.json({ error: "filePath is required" }, 400);

    const line = parsePositiveInt(body.line);
    const column = parsePositiveInt(body.column);

    const db = getEngineDb();
    const repos = await listRepos(db);
    const repo = repos.find((r) => r.id === repoId);
    if (!repo) return c.json({ error: "repo not found" }, 404);

    const absPath = resolve(repo.root_path, filePath);
    if (!isWithinRepo(repo.root_path, absPath)) {
      return c.json({ error: "invalid file path" }, 400);
    }

    const indexedFile = metadataQueries.getByRepoPath(db, repoId, filePath);
    if (!indexedFile && !(await fileExists(absPath))) {
      return c.json({ error: "file not found" }, 404);
    }

    const opened = openInEditor(absPath, line, column);
    if (!opened.opened) {
      return c.json({ error: "unable to open editor", hint: "Install code/cursor/zed or set LENS_EDITOR." }, 500);
    }

    return c.json({
      ok: true,
      path: filePath,
      line: line ?? null,
      column: column ?? null,
      strategy: opened.strategy,
    });
  }),
);
