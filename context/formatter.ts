import type { GatheredContext } from "./gather";
import type { TaskAnalysis } from "./analyzer";
import type { RecentTrace } from "./traces";
import type { RepoScripts } from "../repo/scripts";

/** Format a minimal, retrieval-oriented context pack.
 *  Design: Orientation only — Claude fetches full content via `rlm read`.
 *  No cached summaries/snippets to avoid poisoning with stale opinions. */
export function formatContextPack(
  goal: string,
  analysis: TaskAnalysis,
  context: GatheredContext,
  traces?: RecentTrace[],
  scripts?: RepoScripts,
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${goal}`);
  lines.push(`scope:${analysis.scope} | type:${analysis.task_type} | ${context.relevantFiles.length} files found`);
  lines.push("");

  // Tools section
  lines.push("## Tools");
  lines.push('- `rlm search "<query>"` — search code (grep + semantic)');
  lines.push("- `rlm read <path>` — read full file");
  lines.push('- `rlm run "<command>"` — run tests (npm, cargo, python, git)');

  if (scripts && (scripts.test || scripts.build || scripts.lint)) {
    const parts: string[] = [];
    if (scripts.test) parts.push(`test=${scripts.test}`);
    if (scripts.build) parts.push(`build=${scripts.build}`);
    if (scripts.lint) parts.push(`lint=${scripts.lint}`);
    lines.push(`Detected: ${parts.join(" | ")}`);
  }

  lines.push("");
  lines.push("Workflow: search → read → understand → run to verify");
  lines.push("");

  // Repo map — structural orientation only
  lines.push("## Repo Structure");
  lines.push(context.repoMap);
  lines.push("");

  // Relevant files — paths only, no summaries
  if (context.relevantFiles.length > 0) {
    lines.push("## Files to Investigate");
    for (const file of context.relevantFiles) {
      lines.push(`- ${file.path}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
