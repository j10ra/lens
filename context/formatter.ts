import type { GatheredContext } from "./gather";
import type { TaskAnalysis } from "./analyzer";
import type { RecentTrace } from "./traces";
import type { RepoScripts } from "../repo/scripts";

/** Format a compressed, retrieval-oriented context pack.
 *  Design: Vercel's AGENTS.md pattern — compressed index + retrieval instructions.
 *  Target: < 8KB. Agent fetches full files on demand via `rlm read`. */
export function formatContextPack(
  goal: string,
  analysis: TaskAnalysis,
  context: GatheredContext,
  traces?: RecentTrace[],
  scripts?: RepoScripts,
): string {
  const lines: string[] = [];

  // Header — compressed
  lines.push(`# ${goal}`);
  lines.push(`scope:${analysis.scope} | type:${analysis.task_type} | files:${context.relevantFiles.length}`);
  lines.push("");

  // Tools section with usage guidance
  const toolsLines: string[] = [];
  toolsLines.push("## Tools");
  toolsLines.push('- `rlm search "<query>"` — find code patterns, function defs, usage examples');
  toolsLines.push("- `rlm read <path>` — full file content (use after search or repo map)");
  toolsLines.push('- `rlm run "<command>"` — execute tests, builds, linters to verify changes');
  toolsLines.push("- `rlm summary <path>` — quick file overview without reading full content");

  // Detected scripts line
  if (scripts && (scripts.test || scripts.build || scripts.lint)) {
    const parts: string[] = [];
    if (scripts.test) parts.push(`test=\`${scripts.test}\``);
    if (scripts.build) parts.push(`build=\`${scripts.build}\``);
    if (scripts.lint) parts.push(`lint=\`${scripts.lint}\``);
    toolsLines.push(`Detected: ${parts.join(" | ")}`);
  }

  toolsLines.push("Prefer: search to locate → read to understand → run to verify");
  toolsLines.push("");

  // Recent activity traces
  const traceLines: string[] = [];
  let activeTraces = traces ?? [];
  if (activeTraces.length > 0) {
    traceLines.push("## Recent Activity");
    for (const t of activeTraces) {
      const icon = t.status === "success" ? "ok" : "FAIL";
      const typeTag = t.trace_type !== t.step ? `[${t.trace_type}] ` : "";
      traceLines.push(`[${t.created_at}] ${typeTag}${t.step}: ${truncate(t.task_goal, 60)} → ${icon} (${t.duration_ms}ms)${t.output_summary ? " " + t.output_summary : ""}`);
    }
    traceLines.push("");
  }

  // Budget guard: tools + traces combined must stay under ~500 tokens
  const combined = toolsLines.join("\n") + traceLines.join("\n");
  if (estimateTokens(combined) > 500 && activeTraces.length > 4) {
    // Trim traces to fit
    activeTraces = activeTraces.slice(-4);
    traceLines.length = 0;
    traceLines.push("## Recent Activity");
    for (const t of activeTraces) {
      const icon = t.status === "success" ? "ok" : "FAIL";
      const typeTag = t.trace_type !== t.step ? `[${t.trace_type}] ` : "";
      traceLines.push(`[${t.created_at}] ${typeTag}${t.step}: ${truncate(t.task_goal, 60)} → ${icon} (${t.duration_ms}ms)${t.output_summary ? " " + t.output_summary : ""}`);
    }
    traceLines.push("");
  }

  lines.push(...toolsLines);
  lines.push(...traceLines);

  // Repo map — compressed index
  lines.push("## Repo Map");
  lines.push(context.repoMap);
  lines.push("");

  // Relevant files — table with summaries
  if (context.relevantFiles.length > 0) {
    lines.push("## Relevant Files");
    lines.push("path | summary | exports");
    lines.push("---|---|---");
    for (const file of context.relevantFiles) {
      const summary = file.summary ? truncate(file.summary, 120) : "-";
      const exports = file.key_exports.length > 0 ? file.key_exports.join(", ") : "-";
      lines.push(`${file.path} | ${summary} | ${exports}`);
    }
    lines.push("");

    // Key snippets — top 5 files, 1 snippet each, max 30 lines
    const filesWithSnippets = context.relevantFiles.filter((f) => f.snippets.length > 0);
    if (filesWithSnippets.length > 0) {
      lines.push("## Key Snippets");
      for (const file of filesWithSnippets.slice(0, 5)) {
        for (const snip of file.snippets.slice(0, 1)) {
          const lang = file.path.split(".").pop() ?? "";
          lines.push(`### ${file.path}:${snip.start_line}-${snip.end_line}`);
          lines.push("```" + lang);
          const snippetLines = snip.content.split("\n").slice(0, 30);
          lines.push(snippetLines.join("\n"));
          if (snip.content.split("\n").length > 30) lines.push("// ... truncated");
          lines.push("```");
        }
      }
      lines.push("");
    }
  }

  // Dependencies — compressed
  if (context.dependencyGraph.size > 0) {
    lines.push("## Import Graph");
    for (const [file, deps] of context.dependencyGraph) {
      lines.push(`${file} → ${deps.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
