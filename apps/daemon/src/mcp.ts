import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "lens",
    version: "2.0.0",
  });

  server.registerTool(
    "lens_context_query",
    {
      title: "LENS Context Query",
      // Verb-first, under 200 chars. Operational detail in parameter .describe() — not here.
      description:
        "Query a codebase by keyword and get structural context: which files match, their importers, co-change partners, and hub scores. Use when you need to find where a symbol or concept lives in the repo.",
      inputSchema: {
        repoPath: z.string().describe("Absolute path to the repository root (e.g. /Users/dev/myproject)"),
        query: z
          .string()
          .describe(
            'Search terms space-separated. All terms matched with AND logic. Example: "authMiddleware validate token"',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(20)
          .describe("Max results to return. Default 20, max 50."),
      },
    },
    async ({ repoPath, query, limit }) => {
      // Phase 1 stub — Phase 2 replaces this with real engine query
      // Daemon is not running an engine yet; return structured placeholder
      const response = {
        repoPath,
        query,
        limit,
        results: [],
        note: "LENS engine not yet indexed. Run `lens register <path>` then `lens index` to populate.",
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    },
  );

  const transport = new StdioServerTransport();
  // connect() takes over stdin/stdout for JSON-RPC — must be last thing called
  await server.connect(transport);
}
