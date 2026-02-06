import { api } from "encore.dev/api";
import { ensureIndexed } from "../index/ensure";

interface TaskParams {
  repo_id: string;
  goal: string;
}

interface TaskResponse {
  context_pack: string;
  plan: null;
}

// Stub — replaced in Phase 5. Now triggers auto-indexing.
export const run = api(
  { expose: true, method: "POST", path: "/task" },
  async (params: TaskParams): Promise<TaskResponse> => {
    const indexResult = await ensureIndexed(params.repo_id);

    const status = indexResult
      ? `Indexed ${indexResult.files_scanned} files, ${indexResult.chunks_created} new chunks (${indexResult.duration_ms}ms)`
      : "Index up to date";

    return {
      context_pack: [
        `# Context Pack: ${params.goal}`,
        "",
        `## Index Status`,
        status,
        "",
        "## Note",
        "Context pack builder not yet implemented (Phase 5).",
        "",
        `**repo_id:** ${params.repo_id}`,
        `**goal:** ${params.goal}`,
      ].join("\n"),
      plan: null,
    };
  },
);
