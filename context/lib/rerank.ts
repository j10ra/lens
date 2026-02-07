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

/** Weight by grep selectivity: few grep hits = high precision, trust grep */
function getWeights(grepCount: number): { grep: number; semantic: number } {
  if (grepCount === 0) return { grep: 0, semantic: 1 };
  if (grepCount <= 10) return { grep: 0.8, semantic: 0.2 };
  if (grepCount <= 50) return { grep: 0.6, semantic: 0.4 };
  return { grep: 0.5, semantic: 0.5 };
}

/** Merge grep + vector results, deduplicate by chunk id, rerank */
export function mergeAndRerank(
  grepResults: ScoredResult[],
  vectorResults: ScoredResult[],
  limit: number,
  query?: string,
): RankedResult[] {
  const merged = new Map<string, { grep: number; semantic: number; result: ScoredResult }>();

  const maxGrep = Math.max(1e-9, ...grepResults.map((r) => r.score));
  const maxSemantic = Math.max(1e-9, ...vectorResults.map((r) => r.score));

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

  const w = getWeights(grepResults.length);
  const ranked = Array.from(merged.values())
    .map((entry) => {
      let combinedScore = entry.grep * w.grep + entry.semantic * w.semantic;
      // Bonus for results matching both grep AND semantic
      if (entry.grep > 0 && entry.semantic > 0) combinedScore *= 1.25;

      const matchType = entry.grep > 0 && entry.semantic > 0
        ? "hybrid"
        : entry.grep > 0
          ? "grep"
          : "semantic";

      return formatResult(entry.result, combinedScore, matchType, query);
    })
    .sort((a, b) => b.score - a.score);

  // Dedupe by file path — keep highest-scoring chunk per file
  const seenPaths = new Set<string>();
  const deduped: RankedResult[] = [];
  for (const r of ranked) {
    if (seenPaths.has(r.path)) continue;
    seenPaths.add(r.path);
    deduped.push(r);
  }
  return deduped.slice(0, limit);
}

// JS/TS/Python/Rust/Go keyword declarations
const DECL_RE = /^((export|public|private|protected|internal)\s+)?(static\s+)?(abstract\s+|sealed\s+|partial\s+|override\s+|virtual\s+)*(async\s+)?(function|class|interface|type|const|let|def|fn|pub|func|struct|enum|namespace|record|delegate|module)\s/;
// C#/Java method declarations: access_modifier [modifiers] return_type Name(
const METHOD_RE = /^(public|private|protected|internal)\s+[\w<>\[\],?\s]+\w+\s*\(/;

/** Format a single result for the search response */
export function formatResult(
  r: BaseResult,
  score: number,
  matchType: string,
  query?: string,
): RankedResult {
  const lines = r.content.split("\n");

  // 1. Try matching line (grep hit)
  let snippet = "";
  if (query) {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    const matchLine = lines.find((l) => {
      const lower = l.toLowerCase();
      return terms.some((t) => lower.includes(t));
    });
    if (matchLine) snippet = matchLine.trim();
  }

  // 2. Fall back to declaration line
  if (!snippet) {
    const sigLine = lines.find((l) => {
      const t = l.trimStart();
      return DECL_RE.test(t) || METHOD_RE.test(t);
    });
    snippet = sigLine?.trim() ?? "";
  }

  // 3. Fall back to first non-empty line
  if (!snippet) {
    snippet = lines.find((l) => l.trim().length > 0)?.trim() ?? "";
  }

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
