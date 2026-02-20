import type { Db } from "../db/connection.js";
import { metadataQueries } from "../db/queries.js";
import type { ParsedSymbol, SymbolKind } from "../parsers/types.js";
import { interpretQuery, type ScoredFile } from "./scorer.js";
import { getCochangePartners, getReverseImports } from "./structural.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StructuralMatch {
  kind: "symbol" | "export" | "internal" | "section" | "file" | "directory" | "docstring";
  value: string;
  symbolKind?: SymbolKind;
  line?: number;
  exported?: boolean;
}

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
  matches: StructuralMatch[];
}

export interface GrepResult {
  repoId: string;
  terms: string[];
  results: Record<string, EnrichedMatch[]>;
}

interface EnrichedFileData extends Omit<EnrichedMatch, "matches"> {
  termMatches: Record<string, StructuralMatch[]>;
}

// ── grepRepoImpl ───────────────────────────────────────────────────────────────

/**
 * Top-level grep function. Scores files per term, enriches with structural metadata.
 * Wrapped in lensFn() via the barrel (index.ts).
 *
 * Algorithm:
 * 1. Split query on `|` into terms
 * 2. Score all files via interpretQuery() (TF-IDF + structural signals, all terms combined)
 * 3. Enrich each scored file with importers, co-change partners, exports, docstring, and structural term matches
 * 4. Group results by term using matchedTerms from scoring (no re-scoring), attaching per-term match evidence
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
  const lowerTerms = terms.map((t) => t.toLowerCase());
  const enriched = new Map<string, EnrichedFileData>();
  for (const file of scored) {
    const meta = metadataQueries.getByRepoPath(db, repoId, file.path);
    const exports = safeJsonParse(meta?.exports ?? null);
    const internals = safeJsonParse(meta?.internals ?? null);
    const sections = safeJsonParse(meta?.sections ?? null);
    const symbols = safeSymbolJsonParse(meta?.symbols ?? null);
    const docstring = meta?.docstring ?? "";

    const termMatches: Record<string, StructuralMatch[]> = {};
    for (const lowerTerm of lowerTerms) {
      termMatches[lowerTerm] = collectStructuralMatches(
        file.path,
        lowerTerm,
        exports,
        internals,
        sections,
        symbols,
        docstring,
      );
    }

    enriched.set(file.path, {
      path: file.path,
      score: file.score,
      language: file.language,
      importers: getReverseImports(db, repoId, file.path),
      cochangePartners: getCochangePartners(db, repoId, file.path, 5),
      isHub: file.isHub,
      hubScore: file.hubScore,
      exports,
      docstring,
      termMatches,
    });
  }

  // 4. Group by term using matchedTerms from scoring — no re-querying needed
  const results: Record<string, EnrichedMatch[]> = {};
  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    results[term] = scored
      .filter((s) => s.matchedTerms.includes(lowerTerm))
      .map((s) => {
        const data = enriched.get(s.path);
        if (!data) return null;
        const { termMatches, ...base } = data;
        return {
          ...base,
          matches: termMatches[lowerTerm] ?? [],
        };
      })
      .filter((m): m is EnrichedMatch => m !== null);
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

function collectStructuralMatches(
  path: string,
  term: string,
  exports: string[],
  internals: string[],
  sections: string[],
  symbols: ParsedSymbol[],
  docstring: string,
): StructuralMatch[] {
  const matches: StructuralMatch[] = [];
  const seen = new Set<string>();

  const push = (match: StructuralMatch) => {
    const key = `${match.kind}:${match.value}:${match.line ?? 0}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push(match);
  };

  for (const symbol of symbols) {
    if (!nameContainsTerm(symbol.name, term)) continue;
    push({
      kind: "symbol",
      value: symbol.name,
      symbolKind: symbol.kind,
      line: symbol.line,
      exported: symbol.exported,
    });
  }

  for (const exp of exports) {
    if (nameContainsTerm(exp, term)) {
      push({ kind: "export", value: exp });
    }
  }

  for (const internal of internals) {
    if (nameContainsTerm(internal, term)) {
      push({ kind: "internal", value: internal });
    }
  }

  const fileName = path.split("/").pop() ?? path;
  if (nameContainsTerm(fileName, term)) {
    push({ kind: "file", value: fileName });
  }

  const dirPath = path.split("/").slice(0, -1).join("/");
  if (dirPath.toLowerCase().includes(term)) {
    push({ kind: "directory", value: dirPath });
  }

  for (const section of sections) {
    if (section.toLowerCase().includes(term)) {
      push({ kind: "section", value: section });
    }
  }

  const docHit = docstringSnippet(docstring, term);
  if (docHit) {
    push({ kind: "docstring", value: docHit });
  }

  return matches.slice(0, 12);
}

function docstringSnippet(docstring: string, term: string): string | null {
  const lower = docstring.toLowerCase();
  const idx = lower.indexOf(term);
  if (idx === -1) return null;

  const start = Math.max(0, idx - 24);
  const end = Math.min(docstring.length, idx + term.length + 24);
  return docstring.slice(start, end).trim();
}

function nameContainsTerm(value: string, term: string): boolean {
  const lower = value.toLowerCase();
  if (lower.includes(term)) return true;
  const tokens = decomposeTokens(value);
  return tokens.some((token) => token === term || token.includes(term));
}

function decomposeTokens(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[-_./]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}
