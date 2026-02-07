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
  // Split into terms for multi-word support
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (terms.length === 0) return [];

  // SQL filter by longest (most selective) term; JS filters the rest
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const primary = `%${sorted[0]}%`;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const defnRe = new RegExp(
    "(export|public|private|protected|internal)?\\s*" +
    "(static\\s+)?(abstract\\s+|sealed\\s+|partial\\s+)*(async\\s+)?" +
    "(function|class|interface|type|const|let|def|fn|pub\\s+fn|func|struct|enum|record)\\s+" +
    escaped + "\\b" +
    "|" +
    "(public|private|protected|internal)\\s+[\\w<>\\[\\],?\\s]+\\b" +
    escaped + "\\s*\\(",
    "im",
  );

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
    WHERE repo_id = ${repoId} AND content ILIKE ${primary}
    LIMIT ${limit * 3}
  `;

  const results: GrepResult[] = [];
  for await (const row of rows) {
    if (codeOnly && isDocFile(row.path)) continue;

    // All terms must appear in chunk
    const lowerContent = row.content.toLowerCase();
    if (!sorted.every((t) => lowerContent.includes(t))) continue;

    // Score by per-term match density
    let totalCount = 0;
    for (const term of terms) {
      let pos = 0;
      while ((pos = lowerContent.indexOf(term, pos)) !== -1) {
        totalCount++;
        pos += term.length;
      }
    }
    const score = totalCount / Math.max(1, row.content.length / 100);

    const finalScore = defnRe.test(row.content) ? score * 3 : score;
    results.push({ ...row, score: finalScore });
  }

  // Sort by score (not path order)
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
