export interface BaseResult {
  id: string;
  path: string;
  start_line: number;
  end_line: number;
  content: string;
  language: string | null;
  score: number;
}

interface ScoredResult extends BaseResult {
  match_type: "grep" | "semantic";
}

export interface RankedResult {
  path: string;
  start_line: number;
  end_line: number;
  snippet: string;
  score: number;
  match_type: string;
  language: string | null;
}

const GREP_WEIGHT = 0.3;
const SEMANTIC_WEIGHT = 0.7;

/** Merge grep + vector results, deduplicate by chunk id, rerank */
export function mergeAndRerank(
  grepResults: ScoredResult[],
  vectorResults: ScoredResult[],
  limit: number,
): RankedResult[] {
  const merged = new Map<string, { grep: number; semantic: number; result: ScoredResult }>();

  // Normalize scores to 0-1 range
  const maxGrep = Math.max(1, ...grepResults.map((r) => r.score));
  const maxSemantic = Math.max(1, ...vectorResults.map((r) => r.score));

  for (const r of grepResults) {
    merged.set(r.id, {
      grep: r.score / maxGrep,
      semantic: 0,
      result: r,
    });
  }

  for (const r of vectorResults) {
    const existing = merged.get(r.id);
    if (existing) {
      existing.semantic = r.score / maxSemantic;
    } else {
      merged.set(r.id, {
        grep: 0,
        semantic: r.score / maxSemantic,
        result: r,
      });
    }
  }

  // Compute weighted score + sort
  const ranked = Array.from(merged.values())
    .map((entry) => {
      const combinedScore = entry.grep * GREP_WEIGHT + entry.semantic * SEMANTIC_WEIGHT;
      const matchType = entry.grep > 0 && entry.semantic > 0
        ? "hybrid"
        : entry.grep > 0
          ? "grep"
          : "semantic";

      return formatResult(entry.result, combinedScore, matchType);
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked;
}

/** Format a single result for the search response */
export function formatResult(
  r: BaseResult,
  score: number,
  matchType: string,
): RankedResult {
  // Extract first meaningful line as snippet
  const lines = r.content.split("\n");
  const snippet = lines.find((l) => l.trim().length > 0)?.trim() ?? "";

  return {
    path: r.path,
    start_line: r.start_line,
    end_line: r.end_line,
    snippet,
    score: Math.round(score * 1000) / 1000,
    match_type: matchType,
    language: r.language,
  };
}
