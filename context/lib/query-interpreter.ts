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

// Files that match keywords but add no value for code navigation
const NOISE_EXTENSIONS = new Set([".md", ".json", ".yaml", ".yml", ".toml", ".lock", ".sql", ".txt", ".csv"]);
const NOISE_PATHS = [".gitignore", ".github/", ".vscode/", ".idea/", "node_modules/", "dist/", "build/"];

/** Naive suffix stemmer — strips common English suffixes for fuzzy matching.
 *  "embedding" → "embed", "watcher" → "watch", "indexing" → "index" */
function stem(word: string): string {
  if (word.length <= 4) return word;
  return word
    .replace(/ying$/, "y")
    .replace(/ding$/, "d")
    .replace(/(tion|ment|ness|able|ible|ous|ive|ful|less|ing|er|ed|es|ly|al|ity)$/, "");
}

/** Expand keywords: original + stem + hyphen-split parts */
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

/** Check if path is a noise file (config, migration, dotfile) */
function isNoisePath(path: string): boolean {
  const lower = path.toLowerCase();
  if (NOISE_PATHS.some((p) => lower.includes(p))) return true;
  const lastDot = lower.lastIndexOf(".");
  if (lastDot >= 0 && NOISE_EXTENSIONS.has(lower.slice(lastDot))) return true;
  return false;
}

/** Keyword-scored file selection from metadata index.
 *  Scores: path match (3), export match (2), docstring match (1).
 *  Penalizes non-code files. Boosts recently active files. */
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

  const scored = metadata.map((f) => {
    let score = 0;
    const pathLower = f.path.toLowerCase();
    const exportsLower = (f.exports ?? []).join(" ").toLowerCase();
    const docLower = (f.docstring ?? "").toLowerCase();

    for (const w of words) {
      if (pathLower.includes(w)) score += 3;
      if (exportsLower.includes(w)) score += 2;
      if (docLower.includes(w)) score += 1;
    }

    // Penalize noise files — still show them but rank below code
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
