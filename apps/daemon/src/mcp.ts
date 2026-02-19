import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DAEMON_URL = "http://localhost:4111";

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "lens",
    version: "2.0.0",
  });

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
      // MCP is a gate — calls daemon HTTP, same as CLI
      const res = await fetch(`${DAEMON_URL}/grep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath, query, limit }),
      });

      const data = await res.json();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
