import type { Db } from "../db/connection.js";
import { metadataQueries } from "../db/queries.js";
import type { ParsedSymbol } from "../parsers/types.js";
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
  symbols: 3,
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
    const symbols: ParsedSymbol[] = safeSymbolJsonParse(meta.symbols ?? "[]");

    for (const term of lowerTerms) {
      const count = df.get(term) ?? 0;
      if (
        fileNameContainsTerm(fileName, term) ||
        dirPath.toLowerCase().includes(term) ||
        exportMatchScore(exports, term) > 0 ||
        symbolMatchScore(symbols, term) > 0 ||
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
    const symbols: ParsedSymbol[] = safeSymbolJsonParse(meta.symbols ?? "[]");

    let baseScore = 0;
    const matchedTerms: string[] = [];

    for (const term of lowerTerms) {
      const termIdf = idf.get(term) ?? 1;
      let termScore = 0;

      if (fileNameContainsTerm(fileName, term)) termScore += FIELD_WEIGHTS.fileName * termIdf;
      if (dirPath.toLowerCase().includes(term)) termScore += FIELD_WEIGHTS.dirPath * termIdf;
      const expScore = exportMatchScore(exports, term);
      if (expScore > 0) termScore += FIELD_WEIGHTS.exports * expScore * termIdf;
      const symScore = symbolMatchScore(symbols, term);
      if (symScore > 0) termScore += FIELD_WEIGHTS.symbols * symScore * termIdf;
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

    // Indegree boost: any imported file gets a mild multiplier
    const indegree = indegrees.get(meta.path) ?? 0;
    if (indegree > 0) {
      score *= 1 + Math.log2(1 + indegree) * 0.05;
    }

    // Hub dampening: barrel/catch-all files with many exports dominate unfairly
    if (exports.length > 5) {
      score *= 1 / (1 + Math.log2(exports.length / 5) * 0.3);
    }

    // Multi-term coverage bonus: quality-weighted so docstring-only matches get less boost
    const matchedTermCount = matchedTerms.length;
    if (matchedTermCount > 1) {
      const coverage = matchedTermCount / lowerTerms.length;
      const avgTermScore = baseScore / matchedTermCount;
      const qualityFactor = Math.min(1, avgTermScore / 3);
      score *= 1 + coverage * coverage * qualityFactor;
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

function safeSymbolJsonParse(json: string | null): ParsedSymbol[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is ParsedSymbol =>
        !!s &&
        typeof s === "object" &&
        typeof s.name === "string" &&
        typeof s.kind === "string" &&
        typeof s.line === "number" &&
        typeof s.exported === "boolean",
    );
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

/**
 * Score how well exports match a term.
 * Exact name match → 2.0 (definition file), substring/token → 1.0, no match → 0.
 */
function exportMatchScore(exports: string[], term: string): number {
  let best = 0;
  for (const exp of exports) {
    const lowerExp = exp.toLowerCase();
    if (lowerExp === term) return 2.0;
    if (lowerExp.includes(term)) {
      best = Math.max(best, 1.0);
      continue;
    }
    const tokens = decomposeTokens(exp);
    if (tokens.some((t) => t === term)) best = Math.max(best, 1.0);
  }
  return best;
}

/**
 * Score how well symbol declarations match a term.
 * Exact symbol match => 2.5, token match => 1.5, substring => 1.0.
 */
function symbolMatchScore(symbols: ParsedSymbol[], term: string): number {
  let best = 0;
  for (const symbol of symbols) {
    const lowerName = symbol.name.toLowerCase();
    if (lowerName === term) return 2.5;
    const tokens = decomposeTokens(symbol.name);
    if (tokens.some((t) => t === term)) {
      best = Math.max(best, 1.5);
      continue;
    }
    if (lowerName.includes(term) || tokens.some((t) => t.includes(term))) {
      best = Math.max(best, 1.0);
    }
  }
  return best;
}
