import type { Capabilities } from "../capabilities";
import type { Db } from "../db/connection";
import { repoQueries } from "../db/queries";
import { ensureIndexed } from "../index/engine";
import { track } from "../telemetry";
import type { RequestTrace } from "../trace";
import type { ContextData, ContextResponse } from "../types";
import { formatContextPack } from "./formatter";
import { parseQuery } from "./input-parser";
import { interpretQuery, isNoisePath } from "./query-interpreter";
import { resolveSnippets } from "./snippet";
import {
  discoverTestFiles,
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

function cacheKey(repoId: string, goal: string, commit: string | null, emb = true): string {
  return `${repoId}:${commit ?? ""}:${emb ? "e" : "n"}:${goal}`;
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

export interface ContextOptions {
  useEmbeddings?: boolean;
  includeRankedFiles?: boolean;
  skipCache?: boolean;
}

export async function buildContext(
  db: Db,
  repoId: string,
  goal: string,
  caps?: Capabilities,
  trace?: RequestTrace,
  options?: ContextOptions,
): Promise<ContextResponse> {
  const start = Date.now();

  try {
    trace?.step("ensureIndexed");
    await ensureIndexed(db, repoId, caps);
    trace?.end("ensureIndexed");

    const repo = repoQueries.getById(db, repoId);
    const commit = repo?.last_indexed_commit ?? null;

    const useEmb = options?.useEmbeddings !== false;
    if (!options?.skipCache) {
      const key = cacheKey(repoId, goal, commit, useEmb);
      const cached = cacheGet(key);
      if (cached) {
        trace?.add("cache", 0, "HIT");
        track(db, "context", {
          duration_ms: Date.now() - start,
          result_count: cached.stats.files_in_context,
          cache_hit: true,
        });
        return { ...cached, stats: { ...cached.stats, cached: true, duration_ms: Date.now() - start } };
      }
    }
    const embAvailable = useEmb && (await import("../db/queries")).chunkQueries.hasEmbeddings(db, repoId);

    // Parse query intent
    const parsed = parseQuery(goal);

    trace?.step("loadStructural");
    const metadata = loadFileMetadata(db, repoId);
    const allStats = getAllFileStats(db, repoId);
    const vocabClusters = loadVocabClusters(db, repoId);
    const indegreeMap = getIndegrees(db, repoId);
    const maxImportDepth = repo?.max_import_depth ?? 0;
    trace?.end("loadStructural");

    trace?.step("vectorSearch");
    const vecResults = embAvailable ? await vectorSearch(db, repoId, goal, 10, caps, true).catch(() => []) : [];
    trace?.end("vectorSearch", `${vecResults.length} results`);

    const statsForInterpreter = new Map<string, { commit_count: number; recent_count: number }>();
    for (const [path, stat] of allStats) {
      statsForInterpreter.set(path, { commit_count: stat.commit_count, recent_count: stat.recent_count });
    }
    trace?.step("interpretQuery");
    const interpreted = interpretQuery(
      goal,
      metadata,
      statsForInterpreter,
      vocabClusters,
      indegreeMap,
      maxImportDepth,
      parsed,
    );
    trace?.end("interpretQuery", `${interpreted.files.length} files (${parsed.kind})`);

    trace?.step("cochangePromotion");
    const topForCochange = interpreted.files.slice(0, 5).map((f) => f.path);
    const cochangePartners = getCochangePartners(db, repoId, topForCochange, 5, 15);
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

    trace?.end("cochangePromotion", `${promoted} promoted`);

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

    trace?.step("structuralEnrichment");
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

    trace?.end("structuralEnrichment");

    // Resolve snippets + test files (new v2 stages)
    trace?.step("resolveSnippets");
    const snippets = resolveSnippets(db, repoId, interpreted.files, metadata, parsed, 5);
    const metadataPaths = new Set(metadata.map((m) => m.path));
    const testFiles = discoverTestFiles(
      reverseImports,
      cochanges,
      metadataPaths,
      interpreted.files.slice(0, 5).map((f) => f.path),
    );
    trace?.end("resolveSnippets", `${snippets.size} snippets, ${testFiles.size} test maps`);

    trace?.step("formatContextPack");
    const data: ContextData = {
      goal,
      files: interpreted.files,
      metadata,
      reverseImports,
      forwardImports,
      hop2Deps,
      cochanges,
      fileStats: allStats,
      scores: interpreted.scores,
      snippets,
      testFiles,
      queryKind: parsed.kind,
    };
    const contextPack = formatContextPack(data);
    trace?.end("formatContextPack");

    const response: ContextResponse = {
      context_pack: contextPack,
      stats: {
        files_in_context: interpreted.files.length,
        index_fresh: true,
        duration_ms: Date.now() - start,
        cached: false,
      },
    };

    if (options?.includeRankedFiles) {
      response.ranked_files = interpreted.files.map((f) => ({
        path: f.path,
        reason: f.reason,
        score: interpreted.scores.get(f.path) ?? 0,
      }));
      response.query_kind = parsed.kind;
    }

    if (!options?.skipCache) {
      const key = cacheKey(repoId, goal, commit, useEmb);
      cacheSet(key, response);
    }
    track(db, "context", {
      duration_ms: response.stats.duration_ms,
      result_count: response.stats.files_in_context,
      cache_hit: false,
    });
    return response;
  } catch {
    return {
      context_pack: `# ${goal}\n\nContext generation failed.`,
      stats: { files_in_context: 0, index_fresh: false, duration_ms: Date.now() - start, cached: false },
    };
  }
}
