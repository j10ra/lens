import type { Db } from "../db/connection.js";
import { metadataQueries } from "../db/queries.js";
import { interpretQuery, type ScoredFile } from "./scorer.js";
import { getCochangePartners, getReverseImports } from "./structural.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EnrichedMatch {
  path: string;
  score: number;
  language: string | null;
  importers: string[];
  cochangePartners: Array<{ path: string; count: number }>;
  isHub: boolean;
  hubScore: number;
  exports: string[];
  docstring: string;
}

export interface GrepResult {
  repoId: string;
  terms: string[];
  results: Record<string, EnrichedMatch[]>;
}

// ── grepRepoImpl ───────────────────────────────────────────────────────────────

/**
 * Top-level grep function. Scores files per term, enriches with structural metadata.
 * Wrapped in lensFn() via the barrel (index.ts).
 *
 * Algorithm:
 * 1. Split query on `|` into terms
 * 2. Score all files via interpretQuery() (TF-IDF + structural signals, all terms combined)
 * 3. Enrich each scored file with importers, co-change partners, exports, docstring
 * 4. Group results by term using matchedTerms from scoring (no re-scoring)
 */
export async function grepRepoImpl(db: Db, repoId: string, query: string, limit = 20): Promise<GrepResult> {
  // 1. Parse pipe-separated query into terms
  const terms = query
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean);

  if (terms.length === 0) {
    return { repoId, terms: [], results: {} };
  }

  // 2. Score files across all terms combined — returns top `limit` files with matchedTerms
  const scored: ScoredFile[] = interpretQuery(db, repoId, terms, limit);

  // 3. Enrich each scored file with structural metadata
  const enriched = new Map<string, EnrichedMatch>();
  for (const file of scored) {
    const meta = metadataQueries.getByRepoPath(db, repoId, file.path);

    enriched.set(file.path, {
      path: file.path,
      score: file.score,
      language: file.language,
      importers: getReverseImports(db, repoId, file.path),
      cochangePartners: getCochangePartners(db, repoId, file.path, 5),
      isHub: file.isHub,
      hubScore: file.hubScore,
      exports: safeJsonParse(meta?.exports ?? null),
      docstring: meta?.docstring ?? "",
    });
  }

  // 4. Group by term using matchedTerms from scoring — no re-querying needed
  const results: Record<string, EnrichedMatch[]> = {};
  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    results[term] = scored
      .filter((s) => s.matchedTerms.includes(lowerTerm))
      .map((s) => enriched.get(s.path)!)
      .filter(Boolean);
  }

  return { repoId, terms, results };
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
