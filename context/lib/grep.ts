import { db } from "../../repo/db";
import { isDocFile } from "../../index/lib/discovery";

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
  codeOnly = true,
): Promise<GrepResult[]> {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const defnRe = new RegExp(
    // JS/TS/Python/Rust/Go: keyword-based declarations
    "(export|public|private|protected|internal)?\\s*" +
    "(static\\s+)?(abstract\\s+|sealed\\s+|partial\\s+)*(async\\s+)?" +
    "(function|class|interface|type|const|let|def|fn|pub\\s+fn|func|struct|enum|record)\\s+" +
    escaped + "\\b" +
    "|" +
    // C#/Java methods: access_modifier [modifiers] return_type Name(
    "(public|private|protected|internal)\\s+[\\w<>\\[\\],?\\s]+\\b" +
    escaped + "\\s*\\(",
    "im",
  );

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
    if (codeOnly && isDocFile(row.path)) continue;

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

    const finalScore = defnRe.test(row.content) ? score * 3 : score;
    results.push({ ...row, score: finalScore });
  }

  return results;
}
