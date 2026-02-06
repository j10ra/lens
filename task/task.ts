import { api } from "encore.dev/api";

interface TaskParams {
  repo_id: string;
  goal: string;
}

interface TaskResponse {
  context_pack: string;
  plan: null;
}

// Stub — replaced in Phase 5
export const run = api(
  { expose: true, method: "POST", path: "/task" },
  async (params: TaskParams): Promise<TaskResponse> => {
    return {
      context_pack: [
        `# Context Pack: ${params.goal}`,
        "",
        "## Status",
        "Indexing not yet implemented. This is a stub response.",
        "",
        `**repo_id:** ${params.repo_id}`,
        `**goal:** ${params.goal}`,
      ].join("\n"),
      plan: null,
    };
  },
);
