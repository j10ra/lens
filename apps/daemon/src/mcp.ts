import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "lens",
    version: "2.0.0",
  });

  server.registerTool(
    "lens_grep",
    {
      title: "LENS Grep",
      // Verb-first, under 200 chars. Operational detail in parameter .describe() — not here.
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
      // Phase 1 stub — Phase 2 replaces this with real engine grep
      const terms = query
        .split("|")
        .map((t) => t.trim())
        .filter(Boolean);
      const response = {
        repoPath,
        terms,
        limit,
        results: Object.fromEntries(terms.map((t) => [t, []])),
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
