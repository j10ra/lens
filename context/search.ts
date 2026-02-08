// POST /search — hybrid code search (grep + semantic vector)
// Lazy-indexes and embeds before searching. Traces every query for session continuity.

import { api } from "encore.dev/api";
import { ensureIndexed } from "../index/lib/ensure";
import { grepSearch } from "./lib/grep";
import { vectorSearch, hasEmbeddings } from "./lib/vector";
import { mergeAndRerank, formatResult, type RankedResult } from "./lib/rerank";
import { writeTrace } from "../repo/lib/trace-writer";
import { db } from "../repo/db";

// In-memory search cache — 60s TTL, 50 entries LRU
const CACHE_TTL = 60_000;
const CACHE_MAX = 50;
const searchCache = new Map<string, { ts: number; data: SearchResponse }>();

function cacheKey(repoId: string, query: string, mode: string, limit: number): string {
  return `${repoId}:${query}:${mode}:${limit}`;
}

function getCached(key: string): SearchResponse | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { searchCache.delete(key); return null; }
  return entry.data;
}

function setCache(key: string, data: SearchResponse) {
  if (searchCache.size >= CACHE_MAX) {
    // Evict oldest entry
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }
  searchCache.set(key, { ts: Date.now(), data });
}

interface SearchParams {
  repo_id: string;
  query: string;
  mode?: string;  // "grep" | "semantic" | "hybrid"
  limit?: number;
  code_only?: boolean;
}

interface SearchResponse {
  results: RankedResult[];
  search_mode_used: string;
}

export const search = api(
  { expose: true, method: "POST", path: "/search" },
  async (params: SearchParams): Promise<SearchResponse> => {
    const start = Date.now();
    const limit = Math.min(params.limit ?? 10, 50);
    const requestedMode = params.mode ?? "hybrid";
    const codeOnly = params.code_only ?? true;

    // Check cache first
    const ck = cacheKey(params.repo_id, params.query, requestedMode, limit);
    const cached = getCached(ck);
    if (cached) return cached;

    // Lazy index (fast: only new/changed files)
    await ensureIndexed(params.repo_id);

    // Check embedding availability — don't block search on bulk embedding.
    // Cron worker handles backfill; search just uses whatever is ready.
    let embeddingsAvailable = false;
    try {
      embeddingsAvailable = await hasEmbeddings(params.repo_id);
    } catch {
      // Embedding check failed — degrade to grep
    }

    const effectiveMode = resolveMode(requestedMode, embeddingsAvailable);

    let results: RankedResult[];
    let searchModeUsed: string;

    if (effectiveMode === "grep") {
      const grepResults = await grepSearch(params.repo_id, params.query, limit, codeOnly);
      results = grepResults.map((r) => formatResult(r, r.score, "grep", params.query));
      searchModeUsed = "grep";
    } else if (effectiveMode === "semantic") {
      const vecResults = await vectorSearch(params.repo_id, params.query, limit, codeOnly);
      results = vecResults.map((r) => formatResult(r, r.score, "semantic", params.query));
      searchModeUsed = "semantic";
    } else {
      // Adaptive fast mode: run grep first, skip semantic if grep is precise enough
      const grepResults = await grepSearch(params.repo_id, params.query, limit * 2, codeOnly);
      const grepPrecise = grepResults.length > 0 && grepResults.length <= 5
        && grepResults[0].score > 1.0;

      if (grepPrecise) {
        results = grepResults.slice(0, limit)
          .map((r) => formatResult(r, r.score, "grep", params.query));
        searchModeUsed = "grep_fast";
      } else {
        const vecSettled = await Promise.allSettled([
          vectorSearch(params.repo_id, params.query, limit * 2, codeOnly),
        ]);
        const vecResults = vecSettled[0].status === "fulfilled" ? vecSettled[0].value : [];
        const grepScored = grepResults.map((r) => ({ ...r, match_type: "grep" as const }));
        const vecScored = vecResults.map((r) => ({ ...r, match_type: "semantic" as const }));
        results = mergeAndRerank(grepScored, vecScored, limit, params.query);
        searchModeUsed = "hybrid";
      }
    }

    // Fire-and-forget trace
    writeTrace({
      repo_id: params.repo_id,
      task_goal: params.query,
      step: "search",
      trace_type: "search",
      input: { query: params.query, mode: requestedMode },
      output: { mode_used: searchModeUsed, result_count: results.length },
      status: "success",
      duration_ms: Date.now() - start,
    });

    const response = { results, search_mode_used: searchModeUsed };
    setCache(ck, response);
    return response;
  },
);

function resolveMode(requested: string, embeddingsAvailable: boolean): string {
  if (requested === "grep") return "grep";
  if (requested === "semantic" && embeddingsAvailable) return "semantic";
  if (requested === "semantic" && !embeddingsAvailable) return "grep"; // fallback
  if (requested === "hybrid" && embeddingsAvailable) return "hybrid";
  return "grep"; // default fallback
}
