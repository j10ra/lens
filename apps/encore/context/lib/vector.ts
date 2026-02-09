import { db } from "../../repo/db";
import { embedQuery } from "../../index/lib/embedder";
import { isDocFile } from "../../index/lib/discovery";

export interface VectorResult {
  id: string;
  path: string;
  start_line: number;
  end_line: number;
  content: string;
  language: string | null;
  score: number; // 1 - cosine_distance (higher = more similar)
}

/** Semantic search using pgvector cosine similarity */
export async function vectorSearch(
  repoId: string,
  query: string,
  limit: number,
  codeOnly = true,
): Promise<VectorResult[]> {
  const queryVec = await embedQuery(query);
  const vecStr = `[${queryVec.join(",")}]`;

  // Fetch extra rows to compensate for filtering
  const fetchLimit = codeOnly ? limit * 2 : limit;

  const rows = db.query<{
    id: string;
    path: string;
    start_line: number;
    end_line: number;
    content: string;
    language: string | null;
    distance: number;
  }>`
    SELECT id, path, start_line, end_line, content, language,
           embedding <=> ${vecStr}::vector AS distance
    FROM chunks
    WHERE repo_id = ${repoId} AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vecStr}::vector
    LIMIT ${fetchLimit}
  `;

  const results: VectorResult[] = [];
  for await (const row of rows) {
    if (codeOnly && isDocFile(row.path)) continue;
    results.push({
      id: row.id,
      path: row.path,
      start_line: row.start_line,
      end_line: row.end_line,
      content: row.content,
      language: row.language,
      score: 1 - row.distance,
    });
    if (results.length >= limit) break;
  }

  return results;
}

/** Check if any chunks have embeddings */
export async function hasEmbeddings(repoId: string): Promise<boolean> {
  const row = await db.queryRow<{ count: number }>`
    SELECT count(*)::int AS count FROM chunks
    WHERE repo_id = ${repoId} AND embedding IS NOT NULL
    LIMIT 1
  `;
  return (row?.count ?? 0) > 0;
}
