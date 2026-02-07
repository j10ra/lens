// POST /search — hybrid code search (grep + semantic vector)
// Lazy-indexes and embeds before searching. Traces every query for session continuity.

import { api } from "encore.dev/api";
import { ensureIndexed } from "../index/lib/ensure";
import { ensureEmbedded } from "../index/lib/embed";
import { grepSearch } from "./lib/grep";
import { vectorSearch, hasEmbeddings } from "./lib/vector";
import { mergeAndRerank, formatResult, type RankedResult } from "./lib/rerank";
import { writeTrace } from "../repo/lib/trace-writer";
import { db } from "../repo/db";

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

    // Lazy index + embed
    await ensureIndexed(params.repo_id);

    let embeddingsAvailable = false;
    try {
      await ensureEmbedded(params.repo_id);
      embeddingsAvailable = await hasEmbeddings(params.repo_id);
    } catch {
      // Embedding API down — degrade silently
    }

    const effectiveMode = resolveMode(requestedMode, embeddingsAvailable);

    let results: RankedResult[];
    let searchModeUsed: string;

    if (effectiveMode === "grep") {
      const grepResults = await grepSearch(params.repo_id, params.query, limit, codeOnly);
      results = grepResults.map((r) => formatResult(r, r.score, "grep"));
      searchModeUsed = "grep";
    } else if (effectiveMode === "semantic") {
      const vecResults = await vectorSearch(params.repo_id, params.query, limit, codeOnly);
      results = vecResults.map((r) => formatResult(r, r.score, "semantic"));
      searchModeUsed = "semantic";
    } else {
      const [grepResults, vecResults] = await Promise.all([
        grepSearch(params.repo_id, params.query, limit * 2, codeOnly),
        vectorSearch(params.repo_id, params.query, limit * 2, codeOnly),
      ]);
      const grepScored = grepResults.map((r) => ({ ...r, match_type: "grep" as const }));
      const vecScored = vecResults.map((r) => ({ ...r, match_type: "semantic" as const }));
      results = mergeAndRerank(grepScored, vecScored, limit);
      searchModeUsed = "hybrid";
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

    return { results, search_mode_used: searchModeUsed };
  },
);

function resolveMode(requested: string, embeddingsAvailable: boolean): string {
  if (requested === "grep") return "grep";
  if (requested === "semantic" && embeddingsAvailable) return "semantic";
  if (requested === "semantic" && !embeddingsAvailable) return "grep"; // fallback
  if (requested === "hybrid" && embeddingsAvailable) return "hybrid";
  return "grep"; // default fallback
}
