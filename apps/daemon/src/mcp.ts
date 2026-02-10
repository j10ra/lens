import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db, Capabilities } from "@lens/engine";
import { registerRepo, buildContext, listRepos, getRepoStatus, runIndex, repoQueries } from "@lens/engine";

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
        "Get a ranked context pack of relevant files, imports, and co-change clusters for a development goal. Auto-indexes if stale.",
      inputSchema: { repo_path: z.string(), goal: z.string() },
    },
    async ({ repo_path, goal }) => {
      try {
        const repoId = findOrRegisterRepo(db, repo_path);
        const result = await buildContext(db, repoId, goal, caps);
        return text(result.context_pack);
      } catch (e: any) {
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
      try {
        const repos = listRepos(db);
        return text(JSON.stringify(repos, null, 2));
      } catch (e: any) {
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
      try {
        const repo = repoQueries.getByPath(db, repo_path);
        if (!repo) return error("repo not found at " + repo_path);
        const status = await getRepoStatus(db, repo.id);
        return text(JSON.stringify(status, null, 2));
      } catch (e: any) {
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
      try {
        const repoId = findOrRegisterRepo(db, repo_path);
        const result = await runIndex(db, repoId, caps, force ?? false);
        return text(JSON.stringify(result, null, 2));
      } catch (e: any) {
        return error(e.message);
      }
    },
  );

  return server;
}
