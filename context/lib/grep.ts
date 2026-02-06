import { db } from "../../repo/db";

export interface GrepResult {
  id: string;
  path: string;
  start_line: number;
  end_line: number;
  content: string;
  language: string | null;
  score: number;
}

/** Text-based search using ILIKE on chunk content */
export async function grepSearch(
  repoId: string,
  query: string,
  limit: number,
): Promise<GrepResult[]> {
  const pattern = `%${query}%`;
  const rows = db.query<{
    id: string;
    path: string;
    start_line: number;
    end_line: number;
    content: string;
    language: string | null;
  }>`
    SELECT id, path, start_line, end_line, content, language
    FROM chunks
    WHERE repo_id = ${repoId} AND content ILIKE ${pattern}
    ORDER BY path, start_line
    LIMIT ${limit}
  `;

  const results: GrepResult[] = [];
  for await (const row of rows) {
    // Score by match density (occurrences / content length)
    const lowerContent = row.content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let count = 0;
    let pos = 0;
    while ((pos = lowerContent.indexOf(lowerQuery, pos)) !== -1) {
      count++;
      pos += lowerQuery.length;
    }
    const score = count / Math.max(1, row.content.length / 100);

    results.push({ ...row, score });
  }

  return results;
}
