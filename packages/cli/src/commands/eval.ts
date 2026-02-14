import { post } from "../util/client.js";
import { ensureRepo } from "../util/ensure-repo.js";
import { output } from "../util/format.js";

interface QueryResult {
  id: string;
  query: string;
  kind: string;
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

interface KindBreakdown {
  kind: string;
  count: number;
  hit_at_1: number;
  hit_at_3: number;
  entry_hit_at_1: number;
  entry_hit_at_3: number;
  avg_recall_at_5: number;
  avg_duration_ms: number;
}

interface EvalSummary {
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

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function printTable(summary: EvalSummary): void {
  const w = process.stdout.write.bind(process.stdout);

  w("\n  LENS Eval — Baseline Results\n");
  w("  ═══════════════════════════════════════════\n\n");

  // Overall metrics
  w("  Overall\n");
  w("  ───────────────────────────────────────────\n");
  w(`  Queries:        ${summary.total}\n`);
  w(`  Hit@1:          ${pct(summary.hit_at_1)}\n`);
  w(`  Hit@3:          ${pct(summary.hit_at_3)}\n`);
  w(`  Entry@1:        ${pct(summary.entry_hit_at_1)}\n`);
  w(`  Entry@3:        ${pct(summary.entry_hit_at_3)}\n`);
  w(`  Recall@5:       ${pct(summary.avg_recall_at_5)}\n`);
  w(`  Avg Duration:   ${summary.avg_duration_ms}ms\n\n`);

  // Per-kind breakdown
  if (summary.by_kind.length > 1) {
    w("  By Kind\n");
    w("  ───────────────────────────────────────────\n");
    for (const k of summary.by_kind) {
      w(`  ${k.kind} (n=${k.count})\n`);
      w(
        `    Hit@1: ${pct(k.hit_at_1)}  Hit@3: ${pct(k.hit_at_3)}  Recall@5: ${pct(k.avg_recall_at_5)}  Avg: ${k.avg_duration_ms}ms\n`,
      );
    }
    w("\n");
  }

  // Per-query results
  w("  Per Query\n");
  w("  ───────────────────────────────────────────\n");
  for (const r of summary.results) {
    const mark = r.hit_at_3 ? "+" : "-";
    const entryMark = r.entry_hit_at_3 ? "+" : "-";
    w(`  [${mark}] ${r.id}  ${r.query.slice(0, 50).padEnd(50)}  `);
    w(
      `H@1:${r.hit_at_1 ? "Y" : "N"} H@3:${r.hit_at_3 ? "Y" : "N"} E@3:${entryMark} R@5:${pct(r.recall_at_5).padStart(4)} ${r.duration_ms}ms\n`,
    );

    if (!r.hit_at_3) {
      w(
        `        expected: ${r.expected_files
          .slice(0, 2)
          .map((f) => f.split("/").pop())
          .join(", ")}\n`,
      );
      w(
        `        got top3: ${r.returned_files
          .slice(0, 3)
          .map((f) => f.split("/").pop())
          .join(", ")}\n`,
      );
    }
  }

  w("\n");
}

export async function evalCommand(opts: { json: boolean; kind?: string }): Promise<void> {
  const { repo_id } = await ensureRepo();
  const body: Record<string, unknown> = { repo_id };
  if (opts.kind) body.filter_kind = opts.kind;

  const summary = await post<EvalSummary>("/eval/run", body);

  if (opts.json) {
    output(summary, true);
  } else {
    printTable(summary);
  }
}
