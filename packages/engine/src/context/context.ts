import type { Capabilities } from "../capabilities";
import type { Db } from "../db/connection";
import { repoQueries } from "../db/queries";
import { ensureIndexed } from "../index/engine";
import { track } from "../telemetry";
import type { ContextData, ContextResponse } from "../types";
import { formatContextPack } from "./formatter";
import { interpretQuery, isNoisePath } from "./query-interpreter";
import {
  get2HopReverseDeps,
  getAllFileStats,
  getCochangePartners,
  getCochanges,
  getForwardImports,
  getIndegrees,
  getReverseImports,
  loadFileMetadata,
  loadVocabClusters,
} from "./structural";
import { vectorSearch } from "./vector";

// --- Cache ---
interface CacheEntry {
  response: ContextResponse;
  expires: number;
}
const CACHE_TTL = 120_000;
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
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { response, expires: Date.now() + CACHE_TTL });
}

export async function buildContext(
  db: Db,
  repoId: string,
  goal: string,
  caps?: Capabilities,
): Promise<ContextResponse> {
  const start = Date.now();

  try {
    await ensureIndexed(db, repoId, caps);

    const repo = repoQueries.getById(db, repoId);
    const commit = repo?.last_indexed_commit ?? null;

    const key = cacheKey(repoId, goal, commit);
    const cached = cacheGet(key);
    if (cached) {
      track(db, "context", { duration_ms: Date.now() - start, result_count: cached.stats.files_in_context, cache_hit: true });
      return { ...cached, stats: { ...cached.stats, cached: true, duration_ms: Date.now() - start } };
    }

    const embAvailable = (await import("../db/queries")).chunkQueries.hasEmbeddings(db, repoId);

    const metadata = loadFileMetadata(db, repoId);
    const allStats = getAllFileStats(db, repoId);
    const vocabClusters = loadVocabClusters(db, repoId);
    const indegreeMap = getIndegrees(db, repoId);
    const maxImportDepth = repo?.max_import_depth ?? 0;

    const vecResults = embAvailable ? await vectorSearch(db, repoId, goal, 10, caps, true).catch(() => []) : [];

    const statsForInterpreter = new Map<string, { commit_count: number; recent_count: number }>();
    for (const [path, stat] of allStats) {
      statsForInterpreter.set(path, { commit_count: stat.commit_count, recent_count: stat.recent_count });
    }
    const interpreted = interpretQuery(goal, metadata, statsForInterpreter, vocabClusters, indegreeMap, maxImportDepth);

    // Co-change promotion
    const topForCochange = interpreted.files.slice(0, 5).map((f) => f.path);
    const cochangePartners = getCochangePartners(db, repoId, topForCochange, 3, 20);
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

    // Semantic merge
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
          interpreted.files.pop();
          interpreted.files.push({ path, reason: extractReason(data.content) });
        }
      }
    }

    const hitPaths = interpreted.files.map((f) => f.path);
    const topPaths = hitPaths.slice(0, 3);

    // Structural enrichment
    const reverseImports = getReverseImports(db, repoId, hitPaths);
    const forwardImports = getForwardImports(db, repoId, hitPaths);
    const hop2Deps = get2HopReverseDeps(db, repoId, topPaths);
    const cochanges = getCochanges(db, repoId, hitPaths);

    // Cluster-based co-change promotion
    if (cochanges.length > 0) {
      const selectedSet = new Set(interpreted.files.map((f) => f.path));
      const cap = interpreted.fileCap;
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

    const data: ContextData = {
      goal,
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
        index_fresh: true,
        duration_ms: Date.now() - start,
        cached: false,
      },
    };

    cacheSet(key, response);
    track(db, "context", { duration_ms: response.stats.duration_ms, result_count: response.stats.files_in_context, cache_hit: false });
    return response;
  } catch {
    return {
      context_pack: `# ${goal}\n\nContext generation failed.`,
      stats: { files_in_context: 0, index_fresh: false, duration_ms: Date.now() - start, cached: false },
    };
  }
}
