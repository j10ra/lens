import type { Capabilities, Db } from "@lens/engine";
import { buildContext, getRawDb, getRepoStatus, listRepos, registerRepo, repoQueries, RequestTrace, runIndex, settingsQueries } from "@lens/engine";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const LOG_SQL = `INSERT INTO request_logs (id, method, path, status, duration_ms, source, request_body, response_size, response_body, trace, created_at)
  VALUES (?, ?, ?, ?, ?, 'mcp', ?, ?, ?, ?, datetime('now'))`;

function logMcp(method: string, path: string, status: number, duration: number, reqBody?: string, resSize?: number, resBody?: string, trace?: string) {
  getRawDb().prepare(LOG_SQL).run(randomUUID(), method, path, status, duration, reqBody ?? null, resSize ?? null, resBody ?? null, trace ?? null);
}

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

function error(msg: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: `Error: ${msg}` }] };
}

function findOrRegisterRepo(db: Db, repoPath: string) {
  const existing = repoQueries.getByPath(db, repoPath);
  if (existing) return existing.id;
  const result = registerRepo(db, repoPath);
  return result.repo_id;
}

export function createMcpServer(db: Db, caps?: Capabilities): McpServer {
  const server = new McpServer({ name: "lens", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.registerTool(
    "get_context",
    {
      description:
        "Prefer this tool over Grep/Glob when searching for files relevant to a task across the codebase. Returns ranked files, imports, and co-change clusters for a development goal. Skip for simple lookups where you already know the file path or location.",
      inputSchema: { repo_path: z.string(), goal: z.string() },
    },
    async ({ repo_path, goal }) => {
      const trace = new RequestTrace();
      const start = performance.now();
      try {
        trace.step("findRepo");
        const repoId = findOrRegisterRepo(db, repo_path);
        trace.end("findRepo");
        const useEmbeddings = settingsQueries.get(db, "use_embeddings") !== "false";
        const result = await buildContext(db, repoId, goal, caps, trace, { useEmbeddings });
        const duration = Math.round(performance.now() - start);
        const reqBody = JSON.stringify({ repo_path, goal });
        logMcp("MCP", "/tool/get_context", 200, duration, reqBody, result.context_pack.length, result.context_pack, trace.serialize());
        return text(result.context_pack);
      } catch (e: any) {
        const duration = Math.round(performance.now() - start);
        logMcp("MCP", "/tool/get_context", 500, duration, JSON.stringify({ repo_path, goal }), undefined, e.message, trace.serialize());
        return error(e.message);
      }
    },
  );

  server.registerTool(
    "list_repos",
    {
      description: "List all indexed repositories.",
      inputSchema: {},
    },
    async () => {
      const start = performance.now();
      try {
        const repos = listRepos(db);
        const body = JSON.stringify(repos, null, 2);
        const duration = Math.round(performance.now() - start);
        logMcp("MCP", "/tool/list_repos", 200, duration, undefined, body.length, body);
        return text(body);
      } catch (e: any) {
        const duration = Math.round(performance.now() - start);
        logMcp("MCP", "/tool/list_repos", 500, duration, undefined, undefined, e.message);
        return error(e.message);
      }
    },
  );

  server.registerTool(
    "get_status",
    {
      description: "Get indexing status for a repository.",
      inputSchema: { repo_path: z.string() },
    },
    async ({ repo_path }) => {
      const start = performance.now();
      try {
        const repo = repoQueries.getByPath(db, repo_path);
        if (!repo) {
          logMcp("MCP", "/tool/get_status", 404, Math.round(performance.now() - start), JSON.stringify({ repo_path }));
          return error("repo not found at " + repo_path);
        }
        const status = await getRepoStatus(db, repo.id);
        const body = JSON.stringify(status, null, 2);
        const duration = Math.round(performance.now() - start);
        logMcp("MCP", "/tool/get_status", 200, duration, JSON.stringify({ repo_path }), body.length, body);
        return text(body);
      } catch (e: any) {
        const duration = Math.round(performance.now() - start);
        logMcp("MCP", "/tool/get_status", 500, duration, JSON.stringify({ repo_path }), undefined, e.message);
        return error(e.message);
      }
    },
  );

  server.registerTool(
    "index_repo",
    {
      description: "Index or re-index a repository. Set force=true to rebuild from scratch.",
      inputSchema: { repo_path: z.string(), force: z.boolean().optional() },
    },
    async ({ repo_path, force }) => {
      const trace = new RequestTrace();
      const start = performance.now();
      try {
        trace.step("findRepo");
        const repoId = findOrRegisterRepo(db, repo_path);
        trace.end("findRepo");
        const result = await runIndex(db, repoId, caps, force ?? false, undefined, trace);
        const body = JSON.stringify(result, null, 2);
        const duration = Math.round(performance.now() - start);
        logMcp("MCP", "/tool/index_repo", 200, duration, JSON.stringify({ repo_path, force }), body.length, body, trace.serialize());
        return text(body);
      } catch (e: any) {
        const duration = Math.round(performance.now() - start);
        logMcp("MCP", "/tool/index_repo", 500, duration, JSON.stringify({ repo_path, force }), undefined, e.message, trace.serialize());
        return error(e.message);
      }
    },
  );

  return server;
}
