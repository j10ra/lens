import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context } from "hono";
import { z } from "zod";

const API = "http://localhost:4111/api/mcp";

// Session-based: each client (Claude Code, curl, etc.) gets its own server+transport
const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

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
}

function createSession(): WebStandardStreamableHTTPServerTransport {
  const server = new McpServer({ name: "lens", version: "2.0.0" });
  registerTools(server);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      sessions.set(sessionId, transport);
    },
  });

  server.connect(transport);
  return transport;
}

export async function handleMcp(c: Context): Promise<Response> {
  const sessionId = c.req.header("mcp-session-id");

  // Existing session — route to its transport
  if (sessionId) {
    const transport = sessions.get(sessionId);
    if (transport) return transport.handleRequest(c.req.raw);
  }

  // New client — create fresh server+transport
  const transport = createSession();
  return transport.handleRequest(c.req.raw);
}
