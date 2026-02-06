import { api } from "encore.dev/api";

interface SearchParams {
  repo_id: string;
  query: string;
  mode?: string;
  limit?: number;
}

interface SearchResult {
  path: string;
  start_line: number;
  end_line: number;
  snippet: string;
  score: number;
  match_type: string;
}

interface SearchResponse {
  results: SearchResult[];
  search_mode_used: string;
}

// Stub — replaced in Phase 3
export const search = api(
  { expose: true, method: "POST", path: "/search" },
  async (_params: SearchParams): Promise<SearchResponse> => {
    return { results: [], search_mode_used: "stub" };
  },
);
