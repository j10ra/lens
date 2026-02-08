// POST /context — LLM-routed context pack with impact analysis + history
// POST /task — alias kept for backward compat

import { api } from "encore.dev/api";
import { ensureIndexed } from "../index/lib/ensure";
import { loadFileMetadata, getReverseImports, getCochanges, getFileStats } from "./lib/structural";
import { interpretQuery } from "./lib/query-interpreter";
import { vectorSearch, hasEmbeddings } from "./lib/vector";
import { formatContextPack, type ContextData } from "./lib/formatter";
import { detectScripts } from "../repo/lib/scripts";
import { db } from "../repo/db";

interface ContextParams {
  repo_id: string;
  goal: string;
}

interface ContextResponse {
  context_pack: string;
  stats: {
    files_in_context: number;
    index_fresh: boolean;
    duration_ms: number;
  };
}

async function buildContext(params: ContextParams): Promise<ContextResponse> {
  const start = Date.now();

  try {
    // 1. Ensure index is fresh
    const indexResult = await ensureIndexed(params.repo_id);

    // 2. Load file metadata index
    const metadata = await loadFileMetadata(params.repo_id);

    // 3. Load file stats for activity context
    const allPaths = metadata.map((m) => m.path);
    const allStats = await getFileStats(params.repo_id, allPaths);

    // Build stats map for query interpreter
    const statsForInterpreter = new Map<string, { commit_count: number; recent_count: number }>();
    for (const [path, stat] of allStats) {
      statsForInterpreter.set(path, { commit_count: stat.commit_count, recent_count: stat.recent_count });
    }

    // 4. Keyword-scored file selection from metadata index
    const interpreted = interpretQuery(params.repo_id, params.goal, metadata, statsForInterpreter);

    // 5. Semantic boost — only when keyword results are sparse
    try {
      const keywordSparse = interpreted.files.length < 5;
      const embAvailable = keywordSparse && await hasEmbeddings(params.repo_id);
      if (embAvailable && interpreted.files.length < 8) {
        const vecResults = await vectorSearch(params.repo_id, params.goal, 10, true);

        // Best score per file
        const vecByFile = new Map<string, { score: number; content: string }>();
        for (const r of vecResults) {
          const existing = vecByFile.get(r.path);
          if (!existing || r.score > existing.score) {
            vecByFile.set(r.path, { score: r.score, content: r.content });
          }
        }

        // Add vector-found files not already in keyword results
        const existingPaths = new Set(interpreted.files.map((f) => f.path));
        const candidates = [...vecByFile.entries()]
          .filter(([path]) => !existingPaths.has(path))
          .sort((a, b) => b[1].score - a[1].score);

        for (const [path, data] of candidates) {
          if (interpreted.files.length >= 8) break;
          const lines = data.content.split("\n");
          const sigLine = lines.find((l) => {
            const t = l.trimStart();
            return /^(export|public|private|protected|def |fn |func |class |interface |struct |enum )/.test(t);
          });
          const reason = sigLine?.trim().slice(0, 80) || "semantic match";
          interpreted.files.push({ path, reason });
        }
      }
    } catch {
      // No embeddings or API error — continue with keyword-only
    }

    const hitPaths = interpreted.files.map((f) => f.path);

    // 6. Structural enrichment — run in parallel
    const [reverseImports, cochanges, fileStats] = await Promise.all([
      getReverseImports(params.repo_id, hitPaths),
      getCochanges(params.repo_id, hitPaths),
      getFileStats(params.repo_id, hitPaths),
    ]);

    // 7. Get repo root for script detection
    const repo = await db.queryRow<{ root_path: string }>`
      SELECT root_path FROM repos WHERE id = ${params.repo_id}
    `;
    const scripts = repo ? await detectScripts(repo.root_path).catch(() => undefined) : undefined;

    // 8. Format
    const data: ContextData = {
      goal: params.goal,
      files: interpreted.files,
      reverseImports,
      cochanges,
      fileStats,
      scripts,
    };
    const contextPack = formatContextPack(data);

    return {
      context_pack: contextPack,
      stats: {
        files_in_context: interpreted.files.length,
        index_fresh: indexResult === null,
        duration_ms: Date.now() - start,
      },
    };
  } catch (err) {
    return {
      context_pack: `# ${params.goal}\n\nContext generation failed. Use \`rlm search "<query>"\` and \`rlm read <path>\` to explore manually.`,
      stats: {
        files_in_context: 0,
        index_fresh: false,
        duration_ms: Date.now() - start,
      },
    };
  }
}

// New endpoint
export const context = api(
  { expose: true, method: "POST", path: "/context" },
  async (params: ContextParams): Promise<ContextResponse> => buildContext(params),
);

// Keep /task for backward compat
export const run = api(
  { expose: true, method: "POST", path: "/task" },
  async (params: ContextParams): Promise<ContextResponse> => buildContext(params),
);
