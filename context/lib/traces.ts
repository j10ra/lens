import { db } from "../../repo/db";

export interface RecentTrace {
  step: string;
  trace_type: string;
  status: string;
  task_goal: string;
  duration_ms: number;
  created_at: string;
  output_summary: string;
}

interface TraceRow {
  step: string;
  trace_type: string;
  status: string;
  task_goal: string;
  duration_ms: number;
  created_at: string;
  input: string | Record<string, unknown>;
  output: string | Record<string, unknown>;
}

// Priority: run failures most valuable, read least
const TYPE_PRIORITY: Record<string, number> = {
  run: 2,
  search: 3,
  read: 4,
  summary: 4,
};

/** Fetch smart-filtered traces — time-windowed, priority-ranked, affinity-scored.
 *  Returns top traces most relevant to the current task context. */
export async function getSmartTraces(
  repoId: string,
  goalKeywords: string[],
  relevantPaths: string[],
  windowMinutes = 30,
  maxTraces = 8,
): Promise<RecentTrace[]> {
  // Fetch 16 candidates within time window, priority-ranked
  const rows: (TraceRow & { input_raw: string | Record<string, unknown> })[] = [];
  const cursor = db.query<TraceRow>`
    SELECT step, trace_type, status, task_goal, duration_ms,
           to_char(created_at, 'HH24:MI:SS') as created_at,
           input, output
    FROM traces
    WHERE repo_id = ${repoId}
      AND created_at > now() - make_interval(mins => ${windowMinutes})
    ORDER BY
      CASE
        WHEN status = 'failure' AND trace_type = 'run' THEN 1
        WHEN status = 'success' AND trace_type = 'run' THEN 2
        WHEN trace_type = 'search' THEN 3
        ELSE 4
      END,
      created_at DESC
    LIMIT 16
  `;

  for await (const row of cursor) {
    rows.push({ ...row, input_raw: row.input });
  }

  if (rows.length === 0) return [];

  // Affinity scoring
  const keywordsLower = goalKeywords.map((k) => k.toLowerCase());
  const pathsLower = new Set(relevantPaths.map((p) => p.toLowerCase()));

  const scored = rows.map((row) => {
    const basePriority = row.status === "failure" && row.trace_type === "run"
      ? 1
      : (TYPE_PRIORITY[row.trace_type] ?? 4);

    let affinityBonus = 0;
    const goalLower = (row.task_goal ?? "").toLowerCase();
    const inputStr = typeof row.input_raw === "string"
      ? row.input_raw.toLowerCase()
      : JSON.stringify(row.input_raw).toLowerCase();

    // Keyword match
    for (const kw of keywordsLower) {
      if (goalLower.includes(kw) || inputStr.includes(kw)) {
        affinityBonus += 0.5;
      }
    }

    // Path match
    for (const p of pathsLower) {
      if (inputStr.includes(p) || goalLower.includes(p)) {
        affinityBonus += 1;
      }
    }

    // Lower score = higher priority
    const score = basePriority - affinityBonus;

    const outputObj = typeof row.output === "string"
      ? JSON.parse(row.output)
      : row.output;

    return {
      score,
      trace: {
        step: row.step,
        trace_type: row.trace_type,
        status: row.status,
        task_goal: row.task_goal,
        duration_ms: row.duration_ms,
        created_at: row.created_at,
        output_summary: summarizeOutput(row.step, row.trace_type, row.status, outputObj),
      } as RecentTrace,
    };
  });

  // Sort by score (lower = better), take top N
  scored.sort((a, b) => a.score - b.score);
  const top = scored.slice(0, maxTraces).map((s) => s.trace);

  // Re-sort chronologically for display
  top.sort((a, b) => a.created_at.localeCompare(b.created_at));

  return top;
}

/** Legacy entrypoint — kept for backwards compat until fully wired */
export async function getRecentTraces(
  repoId: string,
  limit = 10,
): Promise<RecentTrace[]> {
  return getSmartTraces(repoId, [], [], 30, limit);
}

function summarizeOutput(
  step: string,
  traceType: string,
  status: string,
  output: Record<string, unknown> | null,
): string {
  if (!output) return "";

  if (traceType === "run" || step === "run") {
    const exit = output.exit_code;
    const stderr_len = output.stderr_len as number;
    if (status === "failure") {
      return `exit ${exit}, stderr: ${stderr_len} chars`;
    }
    return `exit ${exit}`;
  }

  if (traceType === "search") {
    const count = output.result_count ?? 0;
    const mode = output.mode_used ?? "unknown";
    return `${count} results (${mode})`;
  }

  if (traceType === "read") {
    const lines = output.lines_returned ?? output.total_lines ?? 0;
    return `${lines} lines`;
  }

  return status;
}
