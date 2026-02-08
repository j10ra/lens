// POST /context — context pack with dependency graph, co-changes, activity

import { api } from "encore.dev/api";
import { ensureIndexed } from "../index/lib/ensure";
import {
  loadFileMetadata, getAllFileStats, loadVocabClusters,
  getReverseImports, getForwardImports, get2HopReverseDeps, getCochanges,
  getIndegrees, getCochangePartners,
} from "./lib/structural";
import { interpretQuery, isNoisePath } from "./lib/query-interpreter";
import { vectorSearch, hasEmbeddings } from "./lib/vector";
import { formatContextPack, type ContextData } from "./lib/formatter";
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
    cached: boolean;
  };
}

// --- In-memory cache ---
interface CacheEntry {
  response: ContextResponse;
  expires: number;
}

const CACHE_TTL = 120_000; // 120s
const CACHE_MAX = 20;
const cache = new Map<string, CacheEntry>();

function cacheKey(repoId: string, goal: string, commit: string | null): string {
  return `${repoId}:${commit ?? ""}:${goal}`;
}

function cacheGet(key: string): ContextResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.response;
}

function cacheSet(key: string, response: ContextResponse): void {
  // Evict oldest if at capacity
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { response, expires: Date.now() + CACHE_TTL });
}

// --- Build ---

async function buildContext(params: ContextParams): Promise<ContextResponse> {
  const start = Date.now();

  try {
    // 1. Ensure index is fresh
    const indexResult = await ensureIndexed(params.repo_id);

    // Get current commit for cache key
    const repo = await db.queryRow<{ last_indexed_commit: string | null; root_path: string }>`
      SELECT last_indexed_commit, root_path FROM repos WHERE id = ${params.repo_id}
    `;
    const commit = repo?.last_indexed_commit ?? null;

    // 2. Check cache
    const key = cacheKey(params.repo_id, params.goal, commit);
    const cached = cacheGet(key);
    if (cached) {
      return { ...cached, stats: { ...cached.stats, cached: true, duration_ms: Date.now() - start } };
    }

    // 3. Parallel load: metadata + stats + semantic + clusters + indegrees + repo info
    const embAvailable = await hasEmbeddings(params.repo_id);
    const [metadata, allStats, vecResults, vocabClusters, indegreeMap, repoInfo] = await Promise.all([
      loadFileMetadata(params.repo_id),
      getAllFileStats(params.repo_id),
      embAvailable
        ? vectorSearch(params.repo_id, params.goal, 10, true).catch(() => [])
        : Promise.resolve([]),
      loadVocabClusters(params.repo_id),
      getIndegrees(params.repo_id),
      db.queryRow<{ max_import_depth: number }>`SELECT max_import_depth FROM repos WHERE id = ${params.repo_id}`,
    ]);

    // 4. Keyword-scored file selection with TF-IDF
    const statsForInterpreter = new Map<string, { commit_count: number; recent_count: number }>();
    for (const [path, stat] of allStats) {
      statsForInterpreter.set(path, { commit_count: stat.commit_count, recent_count: stat.recent_count });
    }
    const maxImportDepth = repoInfo?.max_import_depth ?? 0;
    const interpreted = interpretQuery(params.goal, metadata, statsForInterpreter, vocabClusters, indegreeMap, maxImportDepth);

    // 5. Co-change promotion — direct partners of top-5 keyword files
    const topForCochange = interpreted.files.slice(0, 5).map((f) => f.path);
    const cochangePartners = await getCochangePartners(params.repo_id, topForCochange, 3, 20);
    const existingPathSet = new Set(interpreted.files.map((f) => f.path));
    let promoted = 0;
    for (const cp of cochangePartners) {
      if (promoted >= 3) break;
      if (existingPathSet.has(cp.partner) || isNoisePath(cp.partner)) continue;
      interpreted.files.push({
        path: cp.partner,
        reason: `co-changes with ${cp.path.split("/").pop()} (${cp.count}x)`,
      });
      existingPathSet.add(cp.partner);
      promoted++;
    }

    // 6. Semantic merge — always runs, can replace weak keyword tail
    if (vecResults.length > 0) {
      const vecByFile = new Map<string, { score: number; content: string }>();
      for (const r of vecResults) {
        const existing = vecByFile.get(r.path);
        if (!existing || r.score > existing.score) {
          vecByFile.set(r.path, { score: r.score, content: r.content });
        }
      }

      const existingPathsSemantic = new Set(interpreted.files.map((f) => f.path));
      const candidates = [...vecByFile.entries()]
        .filter(([path]) => !existingPathsSemantic.has(path) && !isNoisePath(path))
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 5);
      const cap = interpreted.fileCap;

      const extractReason = (content: string): string => {
        const sigLine = content.split("\n").find((l) => {
          const t = l.trimStart();
          return /^(export|public|private|protected|def |fn |func |class |interface |struct |enum )/.test(t);
        });
        return sigLine?.trim().slice(0, 80) || "semantic match";
      };

      for (const [path, data] of candidates) {
        if (interpreted.files.length < cap) {
          interpreted.files.push({ path, reason: extractReason(data.content) });
        } else {
          // Pop weakest keyword result, push semantic result
          interpreted.files.pop();
          interpreted.files.push({ path, reason: extractReason(data.content) });
        }
      }
    }

    const hitPaths = interpreted.files.map((f) => f.path);
    const topPaths = hitPaths.slice(0, 3);

    // 7. Structural enrichment — all in parallel
    const [reverseImports, forwardImports, hop2Deps, cochanges] = await Promise.all([
      getReverseImports(params.repo_id, hitPaths),
      getForwardImports(params.repo_id, hitPaths),
      get2HopReverseDeps(params.repo_id, topPaths),
      getCochanges(params.repo_id, hitPaths),
    ]);

    // 7b. Cluster-based co-change promotion — promote high-count cluster members
    //     not already selected (uses cochanges data we just loaded, zero extra queries)
    if (cochanges.length > 0) {
      const selectedSet = new Set(interpreted.files.map((f) => f.path));
      const cap = interpreted.fileCap;
      // Build clusters same as formatter does
      const clusters: Array<{ members: string[]; count: number }> = [];
      for (const cc of cochanges) {
        const isA = selectedSet.has(cc.path);
        const src = isA ? cc.path : cc.partner;
        const tgt = isA ? cc.partner : cc.path;
        let merged = false;
        for (const c of clusters) {
          if (c.members.includes(src) || c.members.includes(tgt)) {
            if (!c.members.includes(src)) c.members.push(src);
            if (!c.members.includes(tgt)) c.members.push(tgt);
            c.count = Math.max(c.count, cc.count);
            merged = true;
            break;
          }
        }
        if (!merged) clusters.push({ members: [src, tgt], count: cc.count });
      }
      // Promote unselected members from high-count clusters (>= 5 co-commits)
      for (const c of clusters.sort((a, b) => b.count - a.count)) {
        if (c.count < 5) break;
        if (interpreted.files.length >= cap) break;
        for (const m of c.members) {
          if (interpreted.files.length >= cap) break;
          if (selectedSet.has(m) || isNoisePath(m)) continue;
          interpreted.files.push({ path: m, reason: `co-change cluster (${c.count}x)` });
          selectedSet.add(m);
        }
      }
    }

    // 8. Format — reuse allStats (no second query)
    const data: ContextData = {
      goal: params.goal,
      files: interpreted.files,
      metadata,
      reverseImports,
      forwardImports,
      hop2Deps,
      cochanges,
      fileStats: allStats,
    };
    const contextPack = formatContextPack(data);

    const response: ContextResponse = {
      context_pack: contextPack,
      stats: {
        files_in_context: interpreted.files.length,
        index_fresh: indexResult === null,
        duration_ms: Date.now() - start,
        cached: false,
      },
    };

    // 9. Cache
    cacheSet(key, response);
    return response;
  } catch (err) {
    return {
      context_pack: `# ${params.goal}\n\nContext generation failed. Try re-indexing with \`rlm index --force\`.`,
      stats: {
        files_in_context: 0,
        index_fresh: false,
        duration_ms: Date.now() - start,
        cached: false,
      },
    };
  }
}

export const context = api(
  { expose: true, method: "POST", path: "/context" },
  async (params: ContextParams): Promise<ContextResponse> => buildContext(params),
);
