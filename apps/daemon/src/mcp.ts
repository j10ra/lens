import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context } from "hono";
import { z } from "zod";

const API = "http://localhost:4111/api/mcp";

// Session map — tracks active client sessions
const sessions = new Map<string, { transport: WebStandardStreamableHTTPServerTransport; server: McpServer }>();

function registerTools(server: McpServer): void {
  server.registerTool(
    "lens_grep",
    {
      title: "LENS Grep",
      description:
        "Grep a codebase with structural ranking. Returns matched files per search term, ranked by import graph centrality, co-change frequency, and hub score.",
      inputSchema: {
        repoPath: z.string().describe("Absolute path to the repository root (e.g. /Users/dev/myproject)"),
        query: z
          .string()
          .describe(
            'Search terms separated by | (pipe). Each term matched independently. Example: "authMiddleware|validateToken|session"',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(20)
          .describe("Max results per search term. Default 20, max 50."),
      },
    },
    async ({ repoPath, query, limit }) => {
      const res = await fetch(`${API}/grep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath, query, limit }),
      });
      const data = await res.json();
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.registerTool(
    "lens_reindex",
    {
      title: "LENS Reindex",
      description: "Trigger a reindex of a registered repo. Rebuilds file metadata, import graph, and git analysis.",
      inputSchema: {
        repoPath: z.string().describe("Absolute path to the repository root"),
        force: z.boolean().optional().default(false).describe("Force full reindex even if HEAD unchanged"),
      },
    },
    async ({ repoPath, force }) => {
      const listRes = await fetch(`${API}/repos`);
      const repos = (await listRes.json()) as Array<{ id: string; root_path: string }>;
      const repo = repos.find((r) => r.root_path === repoPath || r.root_path === repoPath?.replace(/\/$/, ""));

      if (!repo) {
        return { content: [{ type: "text" as const, text: `Repo not registered: ${repoPath}` }] };
      }

      const res = await fetch(`${API}/repos/${repo.id}/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.registerTool(
    "lens_graph",
    {
      title: "LENS Graph",
      description:
        "Get the dependency graph of a codebase. Without dir: returns directory clusters and inter-cluster import edges. With dir: returns individual files, import edges, and co-change pairs within that directory.",
      inputSchema: {
        repoPath: z.string().describe("Absolute path to the repository root"),
        dir: z
          .string()
          .optional()
          .describe("Directory prefix to drill into (e.g. 'packages/engine/src'). Omit for cluster-level summary."),
      },
    },
    async ({ repoPath, dir }) => {
      const res = await fetch(`${API}/graph`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath, dir }),
      });
      const data = await res.json();
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}

function createSession(): { transport: WebStandardStreamableHTTPServerTransport; server: McpServer } {
  const server = new McpServer({ name: "lens", version: "2.0.0" });
  registerTools(server);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      sessions.set(sessionId, { transport, server });
    },
  });

  server.connect(transport);
  return { transport, server };
}

export async function handleMcp(c: Context): Promise<Response> {
  const sessionId = c.req.header("mcp-session-id");

  // Existing session — route to its transport
  if (sessionId) {
    const entry = sessions.get(sessionId);
    if (entry) return entry.transport.handleRequest(c.req.raw);
    // Stale session (daemon restarted) — clean up and tell client to reinitialize
    return c.json({ jsonrpc: "2.0", error: { code: -32000, message: "Session expired" }, id: null }, 404);
  }

  // New client — create fresh server+transport
  const { transport } = createSession();
  return transport.handleRequest(c.req.raw);
}

/** Clean up a session when its transport closes */
export function cleanupSession(sessionId: string): void {
  sessions.delete(sessionId);
}
