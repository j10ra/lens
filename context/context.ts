import { api } from "encore.dev/api";
import { ensureIndexed } from "../index/ensure";
import { ensureEmbedded } from "../index/embed";
import { generateRepoMap } from "../summary/repomap";
import { analyzeTask, type TaskAnalysis } from "./analyzer";
import { gatherContext } from "./gather";
import { formatContextPack } from "./formatter";
import { getSmartTraces } from "./traces";
import { detectScripts } from "../repo/scripts";
import { db } from "../repo/db";

interface TaskParams {
  repo_id: string;
  goal: string;
}

interface TaskResponse {
  context_pack: string;
  analysis: TaskAnalysis;
  stats: {
    files_in_context: number;
    index_fresh: boolean;
    recent_traces: number;
    duration_ms: number;
  };
}

/** Build a retrieval-oriented context pack — NO LLM calls.
 *  Includes recent activity traces for session continuity. */
export const run = api(
  { expose: true, method: "POST", path: "/task" },
  async (params: TaskParams): Promise<TaskResponse> => {
    const start = Date.now();

    // 1. Ensure index is fresh (fast — diff-aware, skips if HEAD unchanged)
    const indexResult = await ensureIndexed(params.repo_id);

    // 2. Ensure embeddings (lazy — only NULL chunks, non-blocking on failure)
    try { await ensureEmbedded(params.repo_id); } catch { /* grep fallback */ }

    // 3. Repo map from cached summaries (sparse is fine)
    const repoMap = await generateRepoMap(params.repo_id, { maxDepth: 3 });

    // 4. Fast keyword extraction (NO LLM — instant)
    const analysis = analyzeTask(params.goal, repoMap);

    // 5. Search → gather top-k files with cached summaries + code snippets
    const gathered = await gatherContext(params.repo_id, repoMap, analysis);

    // 6. Get repo root for script detection
    const repo = await db.queryRow<{ root_path: string }>`
      SELECT root_path FROM repos WHERE id = ${params.repo_id}
    `;

    // 7. Smart traces — filtered by time + priority + affinity
    const relevantPaths = gathered.relevantFiles.map((f) => f.path);
    const traces = await getSmartTraces(
      params.repo_id,
      analysis.keywords,
      relevantPaths,
    );

    // 8. Detect repo scripts (test/build/lint)
    const scripts = repo ? await detectScripts(repo.root_path) : undefined;

    // 9. Format compressed context pack
    const contextPack = formatContextPack(params.goal, analysis, gathered, traces, scripts);

    return {
      context_pack: contextPack,
      analysis,
      stats: {
        files_in_context: gathered.relevantFiles.length,
        index_fresh: indexResult === null,
        recent_traces: traces.length,
        duration_ms: Date.now() - start,
      },
    };
  },
);
