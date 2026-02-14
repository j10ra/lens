import { buildContext } from "../context/context";
import type { Db } from "../db/connection";
import type { QueryKind } from "../types";
import { GOLD_DATASET, type GoldQuery } from "./gold-dataset";
import { computeMetrics, type EvalSummary, entryHitAtN, hitAtN, type QueryResult, recallAtK } from "./metrics";

export interface EvalOptions {
  filterKind?: QueryKind;
}

export async function runEval(db: Db, repoId: string, options?: EvalOptions): Promise<EvalSummary> {
  let queries: GoldQuery[] = GOLD_DATASET;
  if (options?.filterKind) {
    queries = queries.filter((q) => q.kind === options.filterKind);
  }

  const results: QueryResult[] = [];

  for (const gold of queries) {
    const start = Date.now();
    const response = await buildContext(db, repoId, gold.query, undefined, undefined, {
      useEmbeddings: false,
      includeRankedFiles: true,
      skipCache: true,
    });
    const duration = Date.now() - start;

    const returned = (response.ranked_files ?? []).map((f) => f.path);

    results.push({
      id: gold.id,
      query: gold.query,
      kind: gold.kind,
      expected_files: gold.expected_files,
      expected_entry: gold.expected_entry,
      returned_files: returned,
      hit_at_1: hitAtN(gold.expected_files, returned, 1),
      hit_at_3: hitAtN(gold.expected_files, returned, 3),
      entry_hit_at_1: entryHitAtN(gold.expected_entry, returned, 1),
      entry_hit_at_3: entryHitAtN(gold.expected_entry, returned, 3),
      recall_at_5: recallAtK(gold.expected_files, returned, 5),
      duration_ms: duration,
      file_count: returned.length,
    });
  }

  return computeMetrics(results);
}
