import type { Db } from "../db/connection.js";
import { metadataQueries } from "../db/queries.js";
import { getFileStats, getIndegrees } from "./structural.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const HUB_THRESHOLD = 5;

// Field weights for TF-IDF scoring
const FIELD_WEIGHTS = {
  fileName: 4,
  dirPath: 2,
  exports: 2.5,
  docstring: 1,
  sections: 1,
  internals: 1.5,
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoredFile {
  path: string;
  score: number;
  language: string | null;
  matchedTerms: string[];
  isHub: boolean;
  hubScore: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Split camelCase, PascalCase, snake_case, kebab-case into lowercase tokens.
 * e.g. "getIndegrees" → ["get", "indegrees"]
 *      "build_import_graph" → ["build", "import", "graph"]
 */
function decomposeTokens(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function computeHubScore(indegree: number, maxIndegree: number): number {
  return maxIndegree === 0 ? 0 : Math.min(1, indegree / maxIndegree);
}

// ── interpretQuery ─────────────────────────────────────────────────────────────

/**
 * Core scoring algorithm: TF-IDF over file metadata fields with structural boosters.
 * Synchronous — called from grepRepo() which is lensFn-wrapped.
 *
 * Algorithm:
 * 1. Load all fileMetadata for repo
 * 2. Compute per-term IDF: IDF = min(10, max(1, log(N / df)))
 * 3. Per-file scoring: for each term, check presence in each metadata field → fieldWeight * IDF
 * 4. Structural boosters: hotness (recent commits), indegree boost, hub dampening, multi-term coverage
 * 5. Return top `limit` files sorted by score descending
 */
export function interpretQuery(db: Db, repoId: string, terms: string[], limit: number): ScoredFile[] {
  if (terms.length === 0) return [];

  // 1. Load all metadata for this repo
  const allMeta = metadataQueries.getAllForRepo(db, repoId);
  if (allMeta.length === 0) return [];

  const N = allMeta.length;
  const lowerTerms = terms.map((t) => t.toLowerCase());

  // 2. Load indegrees for all files
  const indegrees = getIndegrees(db, repoId);
  const maxIndegree = indegrees.size > 0 ? Math.max(...indegrees.values()) : 0;

  // 3. Compute document frequencies per term
  const df = new Map<string, number>();
  for (const term of lowerTerms) {
    df.set(term, 0);
  }

  for (const meta of allMeta) {
    const fileName = meta.path.split("/").pop() ?? "";
    const dirPath = meta.path.split("/").slice(0, -1).join("/");
    const exports: string[] = safeJsonParse(meta.exports ?? "[]");
    const docstring = (meta.docstring ?? "").toLowerCase();
    const sections: string[] = safeJsonParse(meta.sections ?? "[]");
    const internals: string[] = safeJsonParse(meta.internals ?? "[]");

    for (const term of lowerTerms) {
      const count = df.get(term) ?? 0;
      if (
        fileNameContainsTerm(fileName, term) ||
        dirPath.toLowerCase().includes(term) ||
        exportsContainTerm(exports, term) ||
        docstring.includes(term) ||
        sections.some((s) => s.toLowerCase().includes(term)) ||
        internals.some((i) => i.toLowerCase().includes(term))
      ) {
        df.set(term, count + 1);
      }
    }
  }

  // 4. Compute IDF per term
  const idf = new Map<string, number>();
  for (const term of lowerTerms) {
    const docFreq = df.get(term) ?? 0;
    const idfVal = docFreq === 0 ? 10 : Math.min(10, Math.max(1, Math.log(N / docFreq)));
    idf.set(term, idfVal);
  }

  // 5. Score each file
  const results: ScoredFile[] = [];

  for (const meta of allMeta) {
    const fileName = meta.path.split("/").pop() ?? "";
    const dirPath = meta.path.split("/").slice(0, -1).join("/");
    const exports: string[] = safeJsonParse(meta.exports ?? "[]");
    const docstring = (meta.docstring ?? "").toLowerCase();
    const sections: string[] = safeJsonParse(meta.sections ?? "[]");
    const internals: string[] = safeJsonParse(meta.internals ?? "[]");

    let baseScore = 0;
    const matchedTerms: string[] = [];

    for (const term of lowerTerms) {
      const termIdf = idf.get(term) ?? 1;
      let termScore = 0;

      if (fileNameContainsTerm(fileName, term)) termScore += FIELD_WEIGHTS.fileName * termIdf;
      if (dirPath.toLowerCase().includes(term)) termScore += FIELD_WEIGHTS.dirPath * termIdf;
      if (exportsContainTerm(exports, term)) termScore += FIELD_WEIGHTS.exports * termIdf;
      if (docstring.includes(term)) termScore += FIELD_WEIGHTS.docstring * termIdf;
      if (sections.some((s) => s.toLowerCase().includes(term))) termScore += FIELD_WEIGHTS.sections * termIdf;
      if (internals.some((i) => i.toLowerCase().includes(term))) termScore += FIELD_WEIGHTS.internals * termIdf;

      if (termScore > 0) {
        baseScore += termScore;
        matchedTerms.push(term);
      }
    }

    // Skip files with no matches
    if (baseScore === 0) continue;

    let score = baseScore;

    // Structural boosters
    // Hotness: recent commit activity
    const stats = getFileStats(db, repoId, meta.path);
    if (stats && stats.recentCount > 0) {
      score += Math.min(5, stats.recentCount * 0.5);
    }

    // Indegree boost: frequently imported files get a mild multiplier
    const indegree = indegrees.get(meta.path) ?? 0;
    if (indegree >= 3) {
      score *= 1 + Math.log2(indegree) * 0.1;
    }

    // Hub dampening: barrel/catch-all files with many exports dominate unfairly
    if (exports.length > 5) {
      score *= 1 / (1 + Math.log2(exports.length / 5) * 0.3);
    }

    // Multi-term coverage bonus: reward files matching multiple terms
    const matchedTermCount = matchedTerms.length;
    if (matchedTermCount > 1) {
      const coverage = matchedTermCount / lowerTerms.length;
      score *= 1 + coverage * coverage;
    }

    const isHub = indegree >= HUB_THRESHOLD;
    const hubScore = computeHubScore(indegree, maxIndegree);

    results.push({
      path: meta.path,
      score,
      language: meta.language ?? null,
      matchedTerms,
      isHub,
      hubScore,
    });
  }

  // Sort by score descending, take top limit
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function safeJsonParse(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fileNameContainsTerm(fileName: string, term: string): boolean {
  const lowerName = fileName.toLowerCase();
  if (lowerName.includes(term)) return true;
  // Also check decomposed tokens
  const tokens = decomposeTokens(fileName);
  return tokens.some((t) => t === term || t.includes(term));
}

function exportsContainTerm(exports: string[], term: string): boolean {
  for (const exp of exports) {
    const lowerExp = exp.toLowerCase();
    if (lowerExp === term || lowerExp.includes(term)) return true;
    // Decompose camelCase for precise token matching
    const tokens = decomposeTokens(exp);
    if (tokens.some((t) => t === term)) return true;
  }
  return false;
}
