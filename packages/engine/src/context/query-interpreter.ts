import type { FileMetadataRow, InterpretedQuery, VocabCluster } from "../types";

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "can",
  "need",
  "must",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "and",
  "but",
  "or",
  "not",
  "no",
  "so",
  "if",
  "then",
  "than",
  "that",
  "this",
  "it",
  "its",
  "all",
  "each",
  "every",
  "any",
  "some",
  "how",
  "what",
  "which",
  "who",
  "when",
  "where",
  "why",
  "get",
  "set",
  "new",
  "null",
  "true",
  "false",
  "void",
  "type",
  "var",
  "let",
  "const",
  "return",
  "import",
  "export",
  "default",
  "class",
  "function",
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "index",
  "data",
  "value",
  "result",
  "item",
  "list",
  "name",
  "id",
  "key",
  "src",
  "lib",
  "app",
  "spec",
  "mock",
  "module",
]);

const NOISE_EXTENSIONS = new Set([
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".lock",
  ".sql",
  ".txt",
  ".csv",
  ".psd",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".xml",
  ".axml",
  ".resx",
  ".config",
]);
const NOISE_PATHS = [
  ".gitignore",
  ".github/",
  ".vscode/",
  ".idea/",
  "node_modules/",
  "dist/",
  "build/",
  "vendor/",
  "vendors/",
  "/scripts/",
  "areas/helppage/",
  "packages.config",
  "resources/drawable/",
  "resources/layout/",
  "resources/values/",
  "wwwroot/lib/",
  "wwwroot/css/",
  "wwwroot/js/lib/",
  ".min.js",
  ".min.css",
  ".designer.cs",
  "assemblyinfo.cs",
];

function stem(word: string): string {
  if (word.length <= 4) return word;
  return word
    .replace(/ying$/, "y")
    .replace(/ding$/, "d")
    .replace(/(tion|ment|ness|able|ible|ous|ive|ful|less|ing|er|ed|es|ly|al|ity)$/, "");
}

const CONCEPT_SYNONYMS: Record<string, string[]> = {
  error: ["interceptor", "exception", "catch", "middleware", "handler"],
  errors: ["interceptor", "exception", "catch", "middleware", "handler"],
  retry: ["interceptor", "backoff", "retry", "queue"],
  retries: ["interceptor", "backoff", "retry", "queue"],
  auth: ["interceptor", "token", "login", "guard", "middleware", "session"],
  authentication: ["interceptor", "token", "login", "guard", "middleware"],
  authorization: ["guard", "role", "permission", "policy"],
  cache: ["invalidat", "ttl", "expire", "store", "memo"],
  caching: ["invalidat", "ttl", "expire", "store", "memo"],
  logging: ["logger", "trace", "monitor", "telemetry"],
  validation: ["validator", "schema", "sanitiz", "constraint"],
  notification: ["email", "alert", "signal", "push", "webhook"],
  upload: ["multipart", "stream", "blob", "attachment", "photo"],
  performance: ["optimize", "cache", "lazy", "batch", "throttle"],
  security: ["auth", "token", "encrypt", "cors", "csrf", "sanitiz"],
  testing: ["spec", "mock", "fixture", "assert", "stub"],
  deploy: ["pipeline", "docker", "build", "release", "ci-cd"],
  database: ["repository", "migration", "query", "schema", "orm"],
  api: ["controller", "endpoint", "route", "middleware", "interceptor"],
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

  for (const w of words) {
    const synonyms = CONCEPT_SYNONYMS[w];
    if (synonyms) {
      for (const syn of synonyms) exact.add(syn);
    }
  }

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

  for (const e of exact) stemmed.delete(e);
  return { exact: [...exact], stemmed: [...stemmed], clusterFiles };
}

export function isNoisePath(path: string): boolean {
  const lower = path.toLowerCase();
  if (NOISE_PATHS.some((p) => lower.includes(p))) return true;
  const lastDot = lower.lastIndexOf(".");
  if (lastDot >= 0 && NOISE_EXTENSIONS.has(lower.slice(lastDot))) return true;
  return false;
}

function buildTermWeights(words: string[], metadata: FileMetadataRow[]): Map<string, number> {
  const N = metadata.length;
  const weights = new Map<string, number>();
  if (N === 0) return weights;

  for (const w of words) {
    let df = 0;
    for (const f of metadata) {
      const haystack =
        `${f.path} ${(f.exports ?? []).join(" ")} ${f.docstring ?? ""} ${f.purpose ?? ""} ${(f.sections ?? []).join(" ")} ${(f.internals ?? []).join(" ")}`.toLowerCase();
      if (haystack.includes(w)) df++;
    }
    const idf = df > 0 ? Math.min(10, Math.max(1, Math.log(N / df))) : 10;
    weights.set(w, idf);
  }
  return weights;
}

export function interpretQuery(
  query: string,
  metadata: FileMetadataRow[],
  fileStats?: Map<string, { commit_count: number; recent_count: number }>,
  vocabClusters?: VocabCluster[] | null,
  indegrees?: Map<string, number>,
  maxImportDepth?: number,
): InterpretedQuery {
  const rawWords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const { exact, stemmed, clusterFiles } = expandKeywords(rawWords, vocabClusters ?? null);
  const allTerms = [...exact, ...stemmed];
  const termWeights = buildTermWeights(allTerms, metadata);

  // Pre-compute decomposed export tokens per file (camelCase/PascalCase → individual words)
  const exportTokensMap = new Map<string, Set<string>>();
  for (const f of metadata) {
    const tokens = new Set<string>();
    for (const exp of f.exports ?? []) {
      for (const part of exp
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .split(/[\s_-]+/)) {
        if (part.length >= 3 && !STOPWORDS.has(part)) tokens.add(part);
      }
    }
    exportTokensMap.set(f.path, tokens);
  }

  const scored = metadata.map((f) => {
    let score = 0;
    let matchedTerms = 0;
    const pathLower = f.path.toLowerCase();
    const exportsLower = (f.exports ?? []).join(" ").toLowerCase();
    const docLower = (f.docstring ?? "").toLowerCase();
    const purposeLower = (f.purpose ?? "").toLowerCase();
    const sectionsLower = (f.sections ?? []).join(" ").toLowerCase();
    const internalsLower = (f.internals ?? []).join(" ").toLowerCase();

    const pathSegments = pathLower.split("/");
    const fileName = pathSegments[pathSegments.length - 1].replace(/\.[^.]+$/, "");
    const fileTokens = fileName
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[._-]/g, " ")
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    const dirTokens = pathSegments
      .slice(-4, -1)
      .flatMap((s) => s.replace(/\./g, " ").split(/\s+/))
      .filter((t) => t.length >= 2);
    const pathTokenSet = new Set([...fileTokens, ...dirTokens]);
    const expTokens = exportTokensMap.get(f.path);

    for (const w of exact) {
      const weight = termWeights.get(w) ?? 1;
      let termScore = 0;
      if (fileTokens.some((t) => t === w || t.includes(w))) termScore += 4 * weight;
      else if (pathTokenSet.has(w)) termScore += 2 * weight;
      if (expTokens?.has(w)) termScore += 2.5 * weight;
      else if (exportsLower.includes(w)) termScore += 2 * weight;
      if (docLower.includes(w) || purposeLower.includes(w)) termScore += 1 * weight;
      if (sectionsLower.includes(w)) termScore += 1 * weight;
      if (internalsLower.includes(w)) termScore += 1.5 * weight;
      if (termScore > 0) matchedTerms++;
      score += termScore;
    }

    for (const w of stemmed) {
      const weight = termWeights.get(w) ?? 1;
      let termScore = 0;
      if (exportsLower.includes(w)) termScore += 2 * weight;
      if (docLower.includes(w) || purposeLower.includes(w)) termScore += 1 * weight;
      if (sectionsLower.includes(w)) termScore += 1 * weight;
      if (internalsLower.includes(w)) termScore += 1.5 * weight;
      if (termScore > 0) matchedTerms++;
      score += termScore;
    }

    if (matchedTerms > 1) {
      const coverage = matchedTerms / allTerms.length;
      score *= 1 + coverage * coverage;
    }

    if (score > 0 && isNoisePath(f.path)) {
      score *= 0.3;
    }

    // Hub dampening: penalize files with excessive exports (data-layer hubs)
    const exportCount = (f.exports ?? []).length;
    if (exportCount > 5 && score > 0) {
      score *= 1 / (1 + Math.log2(exportCount / 5) * 0.3);
    }

    const stats = fileStats?.get(f.path);
    if (stats && stats.recent_count > 0 && score > 0) {
      score += Math.min(stats.recent_count, 5) * 0.5;
    }

    if (score > 0 && clusterFiles.has(f.path)) {
      score *= 1.3;
    }

    if (score > 0 && indegrees) {
      const deg = indegrees.get(f.path) ?? 0;
      if (deg >= 3) {
        score *= 1 + Math.log2(deg) * 0.1;
      }
    }

    return { path: f.path, score, docstring: f.docstring, exports: f.exports };
  });

  const depth = maxImportDepth ?? 0;
  const fileCap = Math.min(Math.max(8, depth * 2 + 4), 15);

  const sorted = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

  const siblingCounts = new Map<string, number>();
  const deduped: typeof sorted = [];
  for (const f of sorted) {
    const key = siblingKey(f.path);
    const count = siblingCounts.get(key) ?? 0;
    if (count >= 2) continue;
    siblingCounts.set(key, count + 1);
    deduped.push(f);
    if (deduped.length >= fileCap) break;
  }

  return {
    fileCap,
    files: deduped.map((f) => {
      const reason =
        f.docstring?.slice(0, 80) ||
        (f.exports?.length ? `exports: ${f.exports.slice(0, 4).join(", ")}` : "path match");
      return { path: f.path, reason };
    }),
  };
}

function siblingKey(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  const dir = lastSlash >= 0 ? path.substring(0, lastSlash) : "";
  const file = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
  const stem = file.replace(/\.[^.]+$/, "");
  const tokens = stem.split(/[-.]/).slice(0, 3).join("-");
  return `${dir}/${tokens}`;
}
