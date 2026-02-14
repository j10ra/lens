import type { QueryKind } from "../types";

export interface QueryResult {
  id: string;
  query: string;
  kind: QueryKind;
  expected_files: string[];
  expected_entry?: string;
  returned_files: string[];
  hit_at_1: boolean;
  hit_at_3: boolean;
  entry_hit_at_1: boolean;
  entry_hit_at_3: boolean;
  recall_at_5: number;
  duration_ms: number;
  file_count: number;
}

export interface KindBreakdown {
  kind: QueryKind;
  count: number;
  hit_at_1: number;
  hit_at_3: number;
  entry_hit_at_1: number;
  entry_hit_at_3: number;
  avg_recall_at_5: number;
  avg_duration_ms: number;
}

export interface EvalSummary {
  total: number;
  hit_at_1: number;
  hit_at_3: number;
  entry_hit_at_1: number;
  entry_hit_at_3: number;
  avg_recall_at_5: number;
  avg_duration_ms: number;
  by_kind: KindBreakdown[];
  results: QueryResult[];
}

export function hitAtN(expected: string[], returned: string[], n: number): boolean {
  const top = returned.slice(0, n);
  return expected.some((e) => top.includes(e));
}

export function entryHitAtN(entry: string | undefined, returned: string[], n: number): boolean {
  if (!entry) return false;
  return returned.slice(0, n).includes(entry);
}

export function recallAtK(expected: string[], returned: string[], k: number): number {
  if (expected.length === 0) return 1;
  const top = new Set(returned.slice(0, k));
  const hits = expected.filter((e) => top.has(e)).length;
  return hits / expected.length;
}

export function computeMetrics(results: QueryResult[]): EvalSummary {
  const total = results.length;
  if (total === 0) {
    return {
      total: 0,
      hit_at_1: 0,
      hit_at_3: 0,
      entry_hit_at_1: 0,
      entry_hit_at_3: 0,
      avg_recall_at_5: 0,
      avg_duration_ms: 0,
      by_kind: [],
      results,
    };
  }

  const hit1 = results.filter((r) => r.hit_at_1).length;
  const hit3 = results.filter((r) => r.hit_at_3).length;
  const entryHit1 = results.filter((r) => r.entry_hit_at_1).length;
  const entryHit3 = results.filter((r) => r.entry_hit_at_3).length;
  const sumRecall = results.reduce((s, r) => s + r.recall_at_5, 0);
  const sumDuration = results.reduce((s, r) => s + r.duration_ms, 0);

  const kinds = [...new Set(results.map((r) => r.kind))];
  const by_kind: KindBreakdown[] = kinds.map((kind) => {
    const group = results.filter((r) => r.kind === kind);
    const n = group.length;
    return {
      kind,
      count: n,
      hit_at_1: group.filter((r) => r.hit_at_1).length / n,
      hit_at_3: group.filter((r) => r.hit_at_3).length / n,
      entry_hit_at_1: group.filter((r) => r.entry_hit_at_1).length / n,
      entry_hit_at_3: group.filter((r) => r.entry_hit_at_3).length / n,
      avg_recall_at_5: group.reduce((s, r) => s + r.recall_at_5, 0) / n,
      avg_duration_ms: Math.round(group.reduce((s, r) => s + r.duration_ms, 0) / n),
    };
  });

  return {
    total,
    hit_at_1: hit1 / total,
    hit_at_3: hit3 / total,
    entry_hit_at_1: entryHit1 / total,
    entry_hit_at_3: entryHit3 / total,
    avg_recall_at_5: sumRecall / total,
    avg_duration_ms: Math.round(sumDuration / total),
    by_kind,
    results,
  };
}
