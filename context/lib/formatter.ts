import type { GatheredContext, RelevantFile } from "./gather";
import type { TaskAnalysis } from "./analyzer";
import type { RecentTrace } from "./traces";
import type { RepoScripts } from "../../repo/lib/scripts";

const TOKEN_BUDGET = 3000;

/** Estimate token count: ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Format AGENTS.md-aligned compressed context pack.
 *  Pipe-delimited index — orientation only, agent reads full files via `rlm read`. */
export function formatContextPack(
  goal: string,
  analysis: TaskAnalysis,
  context: GatheredContext,
  traces?: RecentTrace[],
  scripts?: RepoScripts,
): string {
  const hits = context.relevantFiles.filter((f) => f.role === "hit");
  const neighbors = context.relevantFiles.filter((f) => f.role === "neighbor");

  let pack = buildPack(goal, analysis, context, hits, neighbors, traces, scripts, {
    maxLinePointers: 2,
    maxFiles: 8,
    includeNeighbors: true,
    maxActivity: 5,
  });

  // Truncation cascade if over budget
  if (estimateTokens(pack) > TOKEN_BUDGET) {
    pack = buildPack(goal, analysis, context, hits, neighbors, traces, scripts, {
      maxLinePointers: 1,
      maxFiles: 8,
      includeNeighbors: true,
      maxActivity: 5,
    });
  }
  if (estimateTokens(pack) > TOKEN_BUDGET) {
    pack = buildPack(goal, analysis, context, hits, neighbors, traces, scripts, {
      maxLinePointers: 1,
      maxFiles: 5,
      includeNeighbors: true,
      maxActivity: 5,
    });
  }
  if (estimateTokens(pack) > TOKEN_BUDGET) {
    pack = buildPack(goal, analysis, context, hits, neighbors, traces, scripts, {
      maxLinePointers: 1,
      maxFiles: 5,
      includeNeighbors: false,
      maxActivity: 3,
    });
  }
  if (estimateTokens(pack) > TOKEN_BUDGET) {
    pack = buildPack(goal, analysis, context, hits, neighbors, traces, scripts, {
      maxLinePointers: 1,
      maxFiles: 5,
      includeNeighbors: false,
      maxActivity: 0,
    });
  }

  return pack;
}

interface FormatOpts {
  maxLinePointers: number;
  maxFiles: number;
  includeNeighbors: boolean;
  maxActivity: number;
}

function buildPack(
  goal: string,
  analysis: TaskAnalysis,
  context: GatheredContext,
  hits: RelevantFile[],
  neighbors: RelevantFile[],
  traces: RecentTrace[] | undefined,
  scripts: RepoScripts | undefined,
  opts: FormatOpts,
): string {
  const L: string[] = [];

  // Header
  L.push(`# ${goal}`);
  L.push(`scope:${analysis.scope}|type:${analysis.task_type}|${hits.length} files`);
  L.push("IMPORTANT: Prefer retrieval-led reasoning. Use `rlm read <path>` for full content before modifying any file.");
  L.push("");

  // Tools
  L.push("[Tools]");
  L.push('rlm search "<query>" — grep+semantic search');
  L.push("rlm read <path> — read full file (ALWAYS read before editing)");
  L.push('rlm run "<cmd>" — run tests/build (npm,cargo,python,git)');
  if (scripts && (scripts.test || scripts.build || scripts.lint)) {
    const parts: string[] = [];
    if (scripts.test) parts.push(`test=${scripts.test}`);
    if (scripts.build) parts.push(`build=${scripts.build}`);
    if (scripts.lint) parts.push(`lint=${scripts.lint}`);
    L.push(`|detected: ${parts.join("|")}`);
  }
  L.push("");

  // Repo structure
  L.push("[Repo Structure]");
  L.push(context.repoMap);
  L.push("");

  // File index — pipe-delimited with exp/imp/line pointers
  const displayHits = hits.slice(0, opts.maxFiles);
  if (displayHits.length > 0) {
    L.push("[File Index]");
    for (const file of displayHits) {
      L.push(`|${file.path}`);
      if (file.key_exports.length > 0) {
        L.push(`|  exp: ${file.key_exports.join(",")}`);
      }
      if (file.static_imports.length > 0) {
        L.push(`|  imp: ${file.static_imports.join(",")}`);
      }
      // Line pointers from snippets
      const pointers = extractLinePointers(file, opts.maxLinePointers);
      for (const ptr of pointers) {
        L.push(`|  ${ptr}`);
      }
    }
    L.push("");
  }

  // Import graph — chain format, BFS 3 levels
  const chains = buildImportChains(displayHits, context.importGraph, 3);
  if (chains.length > 0) {
    L.push("[Import Graph]");
    for (const chain of chains) L.push(chain);
    L.push("");
  }

  // Neighbors
  if (opts.includeNeighbors && neighbors.length > 0) {
    L.push("[Neighbors]");
    for (const n of neighbors) {
      const backRefs = findBackRefs(n.path, displayHits);
      const expPart = n.key_exports.length > 0 ? `exp:${n.key_exports.join(",")}` : "";
      const refPart = backRefs.length > 0 ? `←${backRefs.join(",")}` : "";
      const parts = [expPart, refPart].filter(Boolean).join("|");
      L.push(`|${n.path}|${parts}`);
    }
    L.push("");
  }

  // Activity — filtered: run failures ALWAYS, run success, confirmed reads. Skip search traces.
  const filteredTraces = filterTraces(traces ?? [], opts.maxActivity);
  if (filteredTraces.length > 0) {
    L.push("[Activity]");
    for (const t of filteredTraces) {
      L.push(formatTrace(t));
    }
    L.push("");
  }

  return L.join("\n");
}

/** Extract line pointers from snippets — first meaningful line per snippet */
function extractLinePointers(file: RelevantFile, max: number): string[] {
  const pointers: string[] = [];
  for (const snip of file.snippets.slice(0, max)) {
    const lines = snip.content.split("\n");
    // Find first non-empty, non-comment, non-import line
    const sig = lines.find((l) => {
      const trimmed = l.trim();
      return trimmed.length > 0
        && !trimmed.startsWith("//")
        && !trimmed.startsWith("*")
        && !trimmed.startsWith("import ")
        && !trimmed.startsWith("from ");
    }) ?? lines[0];
    if (sig) {
      pointers.push(`L${snip.start_line}: ${sig.trim()}`);
    }
  }
  return pointers;
}

/** Build import chains via BFS from hit files, max depth levels */
function buildImportChains(
  hits: RelevantFile[],
  graph: Map<string, Set<string>>,
  maxDepth: number,
): string[] {
  const chains: string[] = [];
  const seen = new Set<string>();

  for (const file of hits) {
    const edges = graph.get(file.path);
    if (!edges || edges.size === 0) continue;

    for (const target of edges) {
      const chainKey = `${basename(file.path)}->${basename(target)}`;
      if (seen.has(chainKey)) continue;
      seen.add(chainKey);

      const chain = [basename(file.path), basename(target)];
      // Extend chain BFS
      let current = target;
      for (let d = 2; d < maxDepth; d++) {
        const next = graph.get(current);
        if (!next || next.size === 0) break;
        const firstNeighbor = [...next].find((n) => !chain.includes(basename(n)) && n !== file.path);
        if (!firstNeighbor) break;
        chain.push(basename(firstNeighbor));
        current = firstNeighbor;
      }

      chains.push(chain.join(" → "));
      if (chains.length >= 8) return chains;
    }
  }

  return chains;
}

function basename(p: string): string {
  const lastSlash = p.lastIndexOf("/");
  return lastSlash >= 0 ? p.substring(lastSlash + 1) : p;
}

/** Find which hit files import this neighbor */
function findBackRefs(neighborPath: string, hits: RelevantFile[]): string[] {
  const refs: string[] = [];
  for (const h of hits) {
    if (h.static_imports.some((imp) => neighborPath.includes(imp.replace(/^\.\//, "").replace(/^\.\.\//, "")))) {
      refs.push(basename(h.path));
    }
  }
  return refs;
}

/** Filter traces: run failures ALWAYS, run success, confirmed reads. Skip search. */
function filterTraces(traces: RecentTrace[], max: number): RecentTrace[] {
  if (max === 0) return [];
  const filtered = traces.filter((t) => t.trace_type !== "search");
  // Run failures first
  const failures = filtered.filter((t) => t.status === "failure" && t.trace_type === "run");
  const rest = filtered.filter((t) => !(t.status === "failure" && t.trace_type === "run"));
  return [...failures, ...rest].slice(0, max);
}

function formatTrace(t: RecentTrace): string {
  const time = t.created_at;
  if (t.trace_type === "run") {
    const status = t.status === "failure" ? "FAIL" : "OK";
    return `${time} ${status} ${t.output_summary} — ${t.step}`;
  }
  if (t.trace_type === "read") {
    return `${time} read ${t.output_summary} — ${t.step}`;
  }
  return `${time} ${t.trace_type} ${t.status} — ${t.step}`;
}
