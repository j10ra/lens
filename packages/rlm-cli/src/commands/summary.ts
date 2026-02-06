import { ensureRepo } from "../util/ensure-repo.js";
import { post, get } from "../util/client.js";
import { output } from "../util/format.js";

interface GenerateResponse {
  files_summarized: number;
  files_cached: number;
  dirs_summarized: number;
  dirs_cached: number;
  duration_ms: number;
}

interface FileSummaryResponse {
  path: string;
  summary: string;
  key_exports: string[];
  dependencies: string[];
}

export async function summaryCommand(
  path: string | undefined,
  opts: { json: boolean },
): Promise<void> {
  const { repo_id } = await ensureRepo();

  if (path) {
    // Get specific file summary
    const res = await get<FileSummaryResponse>(
      `/summary/${repo_id}/file?path=${encodeURIComponent(path)}`,
    );
    if (opts.json) {
      output(res, true);
    } else {
      output(
        [
          `## ${res.path}`,
          "",
          res.summary,
          "",
          res.key_exports.length > 0 ? `**Exports:** ${res.key_exports.join(", ")}` : "",
          res.dependencies.length > 0 ? `**Dependencies:** ${res.dependencies.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        false,
      );
    }
  } else {
    // Generate summaries for entire repo
    const res = await post<GenerateResponse>("/summary/generate", { repo_id });
    if (opts.json) {
      output(res, true);
    } else {
      output(
        [
          `Summarized ${res.files_summarized} files (${res.files_cached} cached)`,
          `Summarized ${res.dirs_summarized} dirs (${res.dirs_cached} cached)`,
          `Done in ${res.duration_ms}ms`,
        ].join("\n"),
        false,
      );
    }
  }
}
