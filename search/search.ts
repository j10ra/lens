import { api } from "encore.dev/api";
import { ensureIndexed } from "../index/ensure";
import { ensureEmbedded } from "../index/embed";
import { grepSearch } from "./grep";
import { vectorSearch, hasEmbeddings } from "./vector";
import { mergeAndRerank, formatResult, type RankedResult } from "./rerank";

interface SearchParams {
  repo_id: string;
  query: string;
  mode?: string;  // "grep" | "semantic" | "hybrid"
  limit?: number;
}

interface SearchResponse {
  results: RankedResult[];
  search_mode_used: string;
}

export const search = api(
  { expose: true, method: "POST", path: "/search" },
  async (params: SearchParams): Promise<SearchResponse> => {
    const limit = Math.min(params.limit ?? 10, 50);
    const requestedMode = params.mode ?? "hybrid";

    // Lazy index + embed
    await ensureIndexed(params.repo_id);

    let embeddingsAvailable = false;
    try {
      await ensureEmbedded(params.repo_id);
      embeddingsAvailable = await hasEmbeddings(params.repo_id);
    } catch {
      // Embedding API down — degrade silently
    }

    // Determine actual mode
    const effectiveMode = resolveMode(requestedMode, embeddingsAvailable);

    if (effectiveMode === "grep") {
      const grepResults = await grepSearch(params.repo_id, params.query, limit);
      return {
        results: grepResults.map((r) => formatResult(r, r.score, "grep")),
        search_mode_used: "grep",
      };
    }

    if (effectiveMode === "semantic") {
      const vecResults = await vectorSearch(params.repo_id, params.query, limit);
      return {
        results: vecResults.map((r) => formatResult(r, r.score, "semantic")),
        search_mode_used: "semantic",
      };
    }

    // Hybrid: run both in parallel, merge + rerank
    const [grepResults, vecResults] = await Promise.all([
      grepSearch(params.repo_id, params.query, limit * 2),
      vectorSearch(params.repo_id, params.query, limit * 2),
    ]);

    const grepScored = grepResults.map((r) => ({ ...r, match_type: "grep" as const }));
    const vecScored = vecResults.map((r) => ({ ...r, match_type: "semantic" as const }));

    const merged = mergeAndRerank(grepScored, vecScored, limit);

    return { results: merged, search_mode_used: "hybrid" };
  },
);

function resolveMode(requested: string, embeddingsAvailable: boolean): string {
  if (requested === "grep") return "grep";
  if (requested === "semantic" && embeddingsAvailable) return "semantic";
  if (requested === "semantic" && !embeddingsAvailable) return "grep"; // fallback
  if (requested === "hybrid" && embeddingsAvailable) return "hybrid";
  return "grep"; // default fallback
}
