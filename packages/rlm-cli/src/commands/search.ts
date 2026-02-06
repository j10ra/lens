import { ensureRepo } from "../util/ensure-repo.js";
import { post } from "../util/client.js";
import { output } from "../util/format.js";

interface SearchResult {
  path: string;
  start_line: number;
  end_line: number;
  snippet: string;
  score?: number;
  match_type?: string;
}

interface SearchResponse {
  results: SearchResult[];
  search_mode_used: string;
}

export async function searchCommand(
  query: string,
  opts: { json: boolean; mode?: string; limit?: string },
): Promise<void> {
  const { repo_id } = await ensureRepo();
  const res = await post<SearchResponse>("/search", {
    repo_id,
    query,
    mode: opts.mode,
    limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
  });

  if (opts.json) {
    output(res, true);
    return;
  }

  if (!res.results.length) {
    output("No results found.", false);
    return;
  }

  const lines = res.results.map(
    (r) => `- **${r.path}:${r.start_line}** — ${r.snippet.trim().slice(0, 120)}`,
  );
  output(lines.join("\n"), false);
}
