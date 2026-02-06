import { api } from "encore.dev/api";
import { db } from "../repo/db";
import { ensureIndexed } from "../index/ensure";

interface SearchParams {
  repo_id: string;
  query: string;
  mode?: string;
  limit?: number;
}

interface SearchResult {
  path: string;
  start_line: number;
  end_line: number;
  snippet: string;
  score: number;
  match_type: string;
}

interface SearchResponse {
  results: SearchResult[];
  search_mode_used: string;
}

// Grep-based search on chunks. Replaced with hybrid in Phase 3.
export const search = api(
  { expose: true, method: "POST", path: "/search" },
  async (params: SearchParams): Promise<SearchResponse> => {
    // Lazy index before searching
    await ensureIndexed(params.repo_id);

    const limit = Math.min(params.limit ?? 20, 50);
    const pattern = `%${params.query}%`;

    const rows = db.query<{
      path: string;
      start_line: number;
      end_line: number;
      content: string;
    }>`
      SELECT path, start_line, end_line, content
      FROM chunks
      WHERE repo_id = ${params.repo_id} AND content ILIKE ${pattern}
      ORDER BY path, start_line
      LIMIT ${limit}
    `;

    const results: SearchResult[] = [];
    for await (const row of rows) {
      // Extract matching line as snippet
      const lines = row.content.split("\n");
      const matchLine = lines.find((l) => l.toLowerCase().includes(params.query.toLowerCase()));

      results.push({
        path: row.path,
        start_line: row.start_line,
        end_line: row.end_line,
        snippet: matchLine?.trim() ?? lines[0]?.trim() ?? "",
        score: 1,
        match_type: "grep",
      });
    }

    return { results, search_mode_used: "grep" };
  },
);
