import { lensRoute } from "@lens/core";
import { Hono } from "hono";

export const grepRoutes = new Hono();

grepRoutes.post(
  "/",
  lensRoute("grep.post", async (c) => {
    const { repoPath, query, limit = 20 } = await c.req.json();
    const terms = String(query)
      .split("|")
      .map((t: string) => t.trim())
      .filter(Boolean);

    // Phase 2 wires real engine here
    return c.json({
      repoPath,
      terms,
      limit,
      results: Object.fromEntries(terms.map((t: string) => [t, []])),
      note: "LENS engine not yet indexed. Run `lens register <path>` then `lens index` to populate.",
    });
  }),
);
