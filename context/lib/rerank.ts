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

      if (query) {
        const qTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);

        // Definition boost — if chunk contains a declaration with a query term
        const lines = entry.result.content.split("\n");
        const hasDeclMatch = lines.some((line) => {
          const t = line.trimStart();
          if (!DECL_RE.test(t) && !METHOD_RE.test(t)) return false;
          const lower = t.toLowerCase();
          return qTerms.some((qt) => lower.includes(qt));
        });
        if (hasDeclMatch) combinedScore *= 1.5;

        // Filename/path boost — favor files whose name matches query terms
        const pathLower = entry.result.path.toLowerCase();
        const base = pathLower.substring(pathLower.lastIndexOf("/") + 1);
        if (qTerms.some((t) => base.includes(t))) combinedScore *= 1.5;
        else if (qTerms.some((t) => pathLower.includes(t))) combinedScore *= 1.15;
      }

      // Penalize semantic-only results when grep found matches
      if (entry.grep === 0 && entry.semantic > 0 && grepResults.length > 0) {
        combinedScore *= 0.3;
      }

      const matchType = entry.grep > 0 && entry.semantic > 0
        ? "hybrid"
        : entry.grep > 0
          ? "grep"
          : "semantic";

      return formatResult(entry.result, combinedScore, matchType, query);
    });

  // Language priority — detect from grep results (ground truth), not semantic
  const langCounts = new Map<string, number>();
  for (const r of grepResults) {
    if (!r.language) continue;
    langCounts.set(r.language, (langCounts.get(r.language) ?? 0) + 1);
  }
  if (langCounts.size > 1 && grepResults.length >= 3) {
    let primaryLang = "";
    let maxCount = 0;
    for (const [lang, count] of langCounts) {
      if (count > maxCount) { primaryLang = lang; maxCount = count; }
    }
    if (maxCount / grepResults.length > 0.5) {
      for (const r of ranked) {
        if (r.language && r.language !== primaryLang) r.score *= 0.4;
      }
    }
  }

  ranked.sort((a, b) => b.score - a.score);

  // Filter low-score noise and trivial snippets
  const TRIVIAL_SNIPPET_RE = /^[{}();\[\]`]*$/;
  const filtered = ranked.filter(
    (r) => r.score >= 0.05 && !TRIVIAL_SNIPPET_RE.test(r.snippet),
  );

  // Dedupe by file path — keep highest-scoring chunk per file
  const seenPaths = new Set<string>();
  const deduped: RankedResult[] = [];
  for (const r of filtered) {
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

  // 1. Try matching line (grep hit) — skip trivial lines
  const TRIVIAL_LINE_RE = /^[{}();\[\]`,\s]*$/;
  let snippet = "";
  if (query) {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    const matchLine = lines.find((l) => {
      const trimmed = l.trim();
      if (TRIVIAL_LINE_RE.test(trimmed)) return false;
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

  // 3. Fall back to first substantive line (skip braces, comments, imports)
  if (!snippet) {
    const TRIVIAL_RE = /^[{}();\[\]`]*$/;
    const substantive = lines.find((l) => {
      const t = l.trim();
      return t.length > 0 && !TRIVIAL_RE.test(t)
        && !t.startsWith("//") && !t.startsWith("/*") && !t.startsWith("*")
        && !t.startsWith("import ") && !t.startsWith("using ")
        && !t.startsWith("from ");
    });
    snippet = substantive?.trim() ?? `(chunk L${r.start_line}-${r.end_line})`;
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
