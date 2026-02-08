import type { FileMetadataRow } from "./structural";

export interface InterpretedQuery {
  files: Array<{ path: string; reason: string }>;
  refined_keywords: string[];
}

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "need", "must", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "and", "but", "or", "not", "no", "so", "if", "then", "than", "that",
  "this", "it", "its", "all", "each", "every", "any", "some", "how",
  "what", "which", "who", "when", "where", "why",
]);

const NOISE_EXTENSIONS = new Set([".md", ".json", ".yaml", ".yml", ".toml", ".lock", ".sql", ".txt", ".csv"]);
const NOISE_PATHS = [".gitignore", ".github/", ".vscode/", ".idea/", "node_modules/", "dist/", "build/"];

function stem(word: string): string {
  if (word.length <= 4) return word;
  return word
    .replace(/ying$/, "y")
    .replace(/ding$/, "d")
    .replace(/(tion|ment|ness|able|ible|ous|ive|ful|less|ing|er|ed|es|ly|al|ity)$/, "");
}

function expandKeywords(words: string[]): string[] {
  const expanded = new Set<string>();
  for (const w of words) {
    expanded.add(w);
    const stemmed = stem(w);
    if (stemmed.length >= 3 && stemmed !== w) expanded.add(stemmed);
    if (w.includes("-")) {
      for (const part of w.split("-")) {
        if (part.length > 2 && !STOPWORDS.has(part)) {
          expanded.add(part);
          const s = stem(part);
          if (s.length >= 3) expanded.add(s);
        }
      }
    }
  }
  return [...expanded];
}

function isNoisePath(path: string): boolean {
  const lower = path.toLowerCase();
  if (NOISE_PATHS.some((p) => lower.includes(p))) return true;
  const lastDot = lower.lastIndexOf(".");
  if (lastDot >= 0 && NOISE_EXTENSIONS.has(lower.slice(lastDot))) return true;
  return false;
}

/** Build TF-IDF weights: rare terms get higher weight than common ones.
 *  IDF = log(N / df) where df = number of files containing the term. */
function buildTermWeights(
  words: string[],
  metadata: FileMetadataRow[],
): Map<string, number> {
  const N = metadata.length;
  const weights = new Map<string, number>();
  if (N === 0) return weights;

  for (const w of words) {
    let df = 0;
    for (const f of metadata) {
      const haystack = `${f.path} ${(f.exports ?? []).join(" ")} ${f.docstring ?? ""}`.toLowerCase();
      if (haystack.includes(w)) df++;
    }
    // IDF: log(N/df), clamped to [1, 10]. df=0 → max weight
    const idf = df > 0 ? Math.min(10, Math.max(1, Math.log(N / df))) : 10;
    weights.set(w, idf);
  }
  return weights;
}

/** Keyword-scored file selection with TF-IDF weighting and quadratic coverage boost.
 *  Rare terms score higher. Files matching many query terms get exponential boost. */
export function interpretQuery(
  _repoId: string,
  query: string,
  metadata: FileMetadataRow[],
  fileStats?: Map<string, { commit_count: number; recent_count: number }>,
): InterpretedQuery {
  const rawWords = query.toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const words = expandKeywords(rawWords);
  const termWeights = buildTermWeights(words, metadata);

  const scored = metadata.map((f) => {
    let score = 0;
    let matchedTerms = 0;
    const pathLower = f.path.toLowerCase();
    const exportsLower = (f.exports ?? []).join(" ").toLowerCase();
    const docLower = (f.docstring ?? "").toLowerCase();

    for (const w of words) {
      const weight = termWeights.get(w) ?? 1;
      let termScore = 0;
      if (pathLower.includes(w)) termScore += 3 * weight;
      if (exportsLower.includes(w)) termScore += 2 * weight;
      if (docLower.includes(w)) termScore += 1 * weight;
      if (termScore > 0) matchedTerms++;
      score += termScore;
    }

    // Quadratic coverage boost: files matching more query terms
    // score exponentially higher (4/5 terms >> 1/5 terms)
    if (matchedTerms > 1) {
      const coverage = matchedTerms / words.length;
      score *= 1 + coverage * coverage;
    }

    // Penalize noise files
    if (score > 0 && isNoisePath(f.path)) {
      score *= 0.3;
    }

    // Boost recently active files
    const stats = fileStats?.get(f.path);
    if (stats && stats.recent_count > 0 && score > 0) {
      score += Math.min(stats.recent_count, 5) * 0.5;
    }

    return { path: f.path, score, docstring: f.docstring, exports: f.exports };
  });

  const top = scored.filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return {
    files: top.map((f) => {
      const reason = f.docstring?.slice(0, 80)
        || (f.exports?.length ? `exports: ${f.exports.slice(0, 4).join(", ")}` : "path match");
      return { path: f.path, reason };
    }),
    refined_keywords: rawWords,
  };
}
