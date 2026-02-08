import type { FileMetadataRow, VocabCluster } from "./structural";

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

const NOISE_EXTENSIONS = new Set([
  ".md", ".json", ".yaml", ".yml", ".toml", ".lock", ".sql", ".txt", ".csv",
  ".psd", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot",
  ".xml", ".axml", ".resx", ".config",
]);
const NOISE_PATHS = [
  ".gitignore", ".github/", ".vscode/", ".idea/", "node_modules/", "dist/", "build/",
  "vendor/", "vendors/", "/scripts/", "areas/helppage/", "packages.config",
  "resources/drawable/", "resources/layout/", "resources/values/",
  "wwwroot/lib/", "wwwroot/css/", "wwwroot/js/lib/",
  ".min.js", ".min.css", ".designer.cs", "assemblyinfo.cs",
];

function stem(word: string): string {
  if (word.length <= 4) return word;
  return word
    .replace(/ying$/, "y")
    .replace(/ding$/, "d")
    .replace(/(tion|ment|ness|able|ible|ous|ive|ful|less|ing|er|ed|es|ly|al|ity)$/, "");
}

/** Programming concept synonyms — expands vague terms to implementation-level terms */
const CONCEPT_SYNONYMS: Record<string, string[]> = {
  "error": ["interceptor", "exception", "catch", "middleware", "handler"],
  "errors": ["interceptor", "exception", "catch", "middleware", "handler"],
  "retry": ["interceptor", "backoff", "retry", "queue"],
  "retries": ["interceptor", "backoff", "retry", "queue"],
  "auth": ["interceptor", "token", "login", "guard", "middleware", "session"],
  "authentication": ["interceptor", "token", "login", "guard", "middleware"],
  "authorization": ["guard", "role", "permission", "policy"],
  "cache": ["invalidat", "ttl", "expire", "store", "memo"],
  "caching": ["invalidat", "ttl", "expire", "store", "memo"],
  "logging": ["logger", "trace", "monitor", "telemetry"],
  "validation": ["validator", "schema", "sanitiz", "constraint"],
  "notification": ["email", "alert", "signal", "push", "webhook"],
  "upload": ["multipart", "stream", "blob", "attachment", "photo"],
  "performance": ["optimize", "cache", "lazy", "batch", "throttle"],
  "security": ["auth", "token", "encrypt", "cors", "csrf", "sanitiz"],
  "testing": ["spec", "mock", "fixture", "assert", "stub"],
  "deploy": ["pipeline", "docker", "build", "release", "ci-cd"],
  "database": ["repository", "migration", "query", "schema", "orm"],
  "api": ["controller", "endpoint", "route", "middleware", "interceptor"],
};

function expandKeywords(
  words: string[],
  clusters: VocabCluster[] | null,
): { exact: string[]; stemmed: string[]; clusterFiles: Set<string> } {
  const exact = new Set<string>();
  const stemmed = new Set<string>();
  const clusterFiles = new Set<string>();

  for (const w of words) {
    exact.add(w);
    const s = stem(w);
    if (s.length >= 3 && s !== w) stemmed.add(s);
    if (w.includes("-")) {
      for (const part of w.split("-")) {
        if (part.length > 2 && !STOPWORDS.has(part)) {
          exact.add(part);
          const ps = stem(part);
          if (ps.length >= 3 && ps !== part) stemmed.add(ps);
        }
      }
    }
  }

  // Static concept synonyms — always apply (domain intent mapping)
  for (const w of words) {
    const synonyms = CONCEPT_SYNONYMS[w];
    if (synonyms) {
      for (const syn of synonyms) exact.add(syn);
    }
  }

  // Vocab clusters (repo-specific) — supplement with cluster file candidates
  if (clusters) {
    for (const w of words) {
      for (const cluster of clusters) {
        if (cluster.terms.includes(w) || cluster.terms.some((t) => stem(t) === stem(w))) {
          for (const t of cluster.terms) exact.add(t);
          for (const f of cluster.files) clusterFiles.add(f);
        }
      }
    }
  }

  // Remove stems that are already in exact
  for (const e of exact) stemmed.delete(e);
  return { exact: [...exact], stemmed: [...stemmed], clusterFiles };
}

function isNoisePath(path: string): boolean {
  const lower = path.toLowerCase();
  if (NOISE_PATHS.some((p) => lower.includes(p))) return true;
  const lastDot = lower.lastIndexOf(".");
  if (lastDot >= 0 && NOISE_EXTENSIONS.has(lower.slice(lastDot))) return true;
  return false;
}

/** Build TF-IDF weights: rare terms get higher weight than common ones. */
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
    const idf = df > 0 ? Math.min(10, Math.max(1, Math.log(N / df))) : 10;
    weights.set(w, idf);
  }
  return weights;
}

/** Keyword-scored file selection with TF-IDF weighting and quadratic coverage boost.
 *  Exact terms match path+exports+docstring. Stems only match exports+docstring (not paths). */
export function interpretQuery(
  _repoId: string,
  query: string,
  metadata: FileMetadataRow[],
  fileStats?: Map<string, { commit_count: number; recent_count: number }>,
  vocabClusters?: VocabCluster[] | null,
): InterpretedQuery {
  const rawWords = query.toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const { exact, stemmed, clusterFiles } = expandKeywords(rawWords, vocabClusters ?? null);
  const allTerms = [...exact, ...stemmed];
  const termWeights = buildTermWeights(allTerms, metadata);

  const scored = metadata.map((f) => {
    let score = 0;
    let matchedTerms = 0;
    const pathLower = f.path.toLowerCase();
    const exportsLower = (f.exports ?? []).join(" ").toLowerCase();
    const docLower = (f.docstring ?? "").toLowerCase();

    // Split path into meaningful tokens: filename stem + directory segments
    const pathSegments = pathLower.split("/");
    const fileName = pathSegments[pathSegments.length - 1].replace(/\.[^.]+$/, "");
    // Tokenize filename (camelCase/PascalCase/snake_case → words)
    const fileTokens = fileName
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[._-]/g, " ")
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    // Directory names (last 3 segments, excluding filename)
    const dirTokens = pathSegments.slice(-4, -1)
      .flatMap((s) => s.replace(/\./g, " ").split(/\s+/))
      .filter((t) => t.length >= 2);
    const pathTokenSet = new Set([...fileTokens, ...dirTokens]);

    // Exact terms: match path tokens + exports + docstring
    // Path scoring: filename token match = 4x, dir token match = 2x (replaces substring)
    for (const w of exact) {
      const weight = termWeights.get(w) ?? 1;
      let termScore = 0;
      if (fileTokens.some((t) => t === w || t.includes(w))) termScore += 4 * weight;
      else if (pathTokenSet.has(w)) termScore += 2 * weight;
      if (exportsLower.includes(w)) termScore += 2 * weight;
      if (docLower.includes(w)) termScore += 1 * weight;
      if (termScore > 0) matchedTerms++;
      score += termScore;
    }

    // Stemmed terms: only match exports + docstring (NOT paths)
    // Prevents "handling" stem → "handl" matching "StorageHandling" in paths
    for (const w of stemmed) {
      const weight = termWeights.get(w) ?? 1;
      let termScore = 0;
      if (exportsLower.includes(w)) termScore += 2 * weight;
      if (docLower.includes(w)) termScore += 1 * weight;
      if (termScore > 0) matchedTerms++;
      score += termScore;
    }

    // Quadratic coverage boost
    if (matchedTerms > 1) {
      const coverage = matchedTerms / allTerms.length;
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

    // Cluster file bonus: only boost files that already have keyword matches
    if (score > 0 && clusterFiles.has(f.path)) {
      score *= 1.3;
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
