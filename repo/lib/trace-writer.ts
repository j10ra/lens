import { db } from "../db";

export type TraceType = "run" | "search" | "read" | "summary";

export interface TraceParams {
  repo_id: string;
  task_goal: string;
  step: string;
  trace_type: TraceType;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status: string;
  duration_ms: number;
}

const MAX_PENDING = 10;
let pending = 0;

/** Fire-and-forget trace insert. Drops silently if overloaded (>10 pending).
 *  5s hard timeout per insert prevents pile-up under DB pressure. */
export function writeTrace(params: TraceParams): void {
  if (pending >= MAX_PENDING) return;
  pending++;

  const timeout = setTimeout(() => { pending--; }, 5000);

  db.exec`
    INSERT INTO traces (repo_id, task_goal, step, trace_type, input, output, status, duration_ms)
    VALUES (
      ${params.repo_id}, ${params.task_goal}, ${params.step}, ${params.trace_type},
      ${JSON.stringify(params.input)}::jsonb,
      ${JSON.stringify(params.output)}::jsonb,
      ${params.status}, ${params.duration_ms}
    )
  `.then(() => {
    clearTimeout(timeout);
    pending--;
  }).catch(() => {
    clearTimeout(timeout);
    pending--;
  });
}
