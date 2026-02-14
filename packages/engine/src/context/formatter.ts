import type { CochangeRow, ContextData, ResolvedSnippet } from "../types";

const TOKEN_CAP = 2000;

function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.substring(i + 1) : p;
}

// --- Helpers ---

const LANG_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  cs: "csharp",
  cpp: "cpp",
  c: "c",
  h: "c",
  swift: "swift",
  php: "php",
  sql: "sql",
  sh: "shell",
};

function guessLang(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "";
  return LANG_EXT[path.substring(dot + 1)] ?? "";
}

function getPurpose(path: string, data: ContextData): string {
  for (const m of data.metadata) {
    if (m.path === path && m.purpose) return m.purpose;
  }
  return "";
}

function renderImports(path: string, data: ContextData): string {
  const fwd = data.forwardImports.get(path)?.slice(0, 3) ?? [];
  const rev = data.reverseImports.get(path)?.slice(0, 3) ?? [];
  const parts: string[] = [];
  if (rev.length) parts.push(`\u2190 ${rev.join(", ")}`);
  if (fwd.length) parts.push(`\u2192 ${fwd.join(", ")}`);
  return parts.join(" | ");
}

function renderCochanges(path: string, cochanges: CochangeRow[], limit = 2): string {
  const partners: Array<{ name: string; count: number }> = [];
  for (const cc of cochanges) {
    if (cc.path === path) partners.push({ name: basename(cc.partner), count: cc.count });
    else if (cc.partner === path) partners.push({ name: basename(cc.path), count: cc.count });
  }
  partners.sort((a, b) => b.count - a.count);
  return partners
    .slice(0, limit)
    .map((p) => `${p.name} (${p.count}x)`)
    .join(", ");
}

function getExports(path: string, data: ContextData): string[] {
  for (const m of data.metadata) {
    if (m.path === path) return m.exports ?? [];
  }
  return [];
}

function fileLabel(path: string, snippet?: ResolvedSnippet): string {
  const line = snippet?.line ? `:${snippet.line}` : "";
  return `${path}${line}`;
}

function renderSlice(path: string, data: ContextData): string | null {
  const slice = data.slices?.get(path);
  if (!slice) return null;
  const lang = guessLang(path);
  return `   \`\`\`${lang}\n${slice.code}\n   \`\`\``;
}

// --- Templates ---

function formatNatural(data: ContextData): string {
  const L: string[] = [];
  const files = data.files.slice(0, 7);
  const snippets = data.snippets ?? new Map();

  L.push(`# ${data.goal}`);
  L.push("");
  L.push("## Key Files");

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const snip = snippets.get(f.path);
    const purpose = getPurpose(f.path, data);
    const label = fileLabel(f.path, snip);
    L.push(`${i + 1}. **${label}**${purpose ? ` \u2014 ${purpose}` : ""}`);

    const exports = getExports(f.path, data);
    if (exports.length) L.push(`   Exports: ${exports.slice(0, 5).join(", ")}`);

    const imports = renderImports(f.path, data);
    if (imports) L.push(`   ${imports}`);

    const cochangeStr = renderCochanges(f.path, data.cochanges);
    if (cochangeStr) L.push(`   Co-changes: ${cochangeStr}`);

    const sliceStr = renderSlice(f.path, data);
    if (sliceStr) L.push(sliceStr);
  }

  // Test files
  const testLines: string[] = [];
  const testFiles = data.testFiles;
  if (testFiles) {
    const seen = new Set<string>();
    for (const f of files.slice(0, 5)) {
      const tests = testFiles.get(f.path);
      if (tests) {
        for (const t of tests) {
          if (!seen.has(t)) {
            seen.add(t);
            testLines.push(`- ${t}`);
          }
        }
      }
    }
  }
  if (testLines.length) {
    L.push("");
    L.push("## Tests");
    for (const t of testLines) L.push(t);
  }

  return L.join("\n");
}

function formatSymbol(data: ContextData): string {
  const L: string[] = [];
  const files = data.files;
  const snippets = data.snippets ?? new Map();
  const top = files[0];
  if (!top) return `# ${data.goal}\n\nNo files found.`;

  const snip = snippets.get(top.path);
  const purpose = getPurpose(top.path, data);

  L.push(`# Symbol: ${data.goal}`);
  L.push("");
  L.push("## Definition");
  L.push(`**${fileLabel(top.path, snip)}**${purpose ? ` \u2014 ${purpose}` : ""}`);

  // Show signature from snippet or exports
  if (snip?.symbol) {
    L.push(`  \`${snip.symbol}\``);
  } else {
    const exports = getExports(top.path, data);
    if (exports.length) L.push(`  Exports: ${exports.slice(0, 5).join(", ")}`);
  }

  const sliceStr = renderSlice(top.path, data);
  if (sliceStr) L.push(sliceStr);

  // Dependents (reverse imports)
  const rev = data.reverseImports.get(top.path);
  if (rev?.length) {
    L.push("");
    L.push("## Dependents");
    L.push(`\u2190 ${rev.slice(0, 5).join(", ")}`);
  }

  // Co-changes
  const cochangeStr = renderCochanges(top.path, data.cochanges, 3);
  if (cochangeStr) {
    L.push("");
    L.push("## Co-changes");
    L.push(cochangeStr);
  }

  // Other relevant files
  if (files.length > 1) {
    L.push("");
    L.push("## Also relevant");
    for (let i = 1; i < Math.min(files.length, 5); i++) {
      const f = files[i];
      const p = getPurpose(f.path, data);
      L.push(`${i + 1}. ${f.path}${p ? ` \u2014 ${p}` : ""}`);
    }
  }

  return L.join("\n");
}

function formatError(data: ContextData): string {
  const L: string[] = [];
  const files = data.files;
  const snippets = data.snippets ?? new Map();

  L.push(`# Error: ${data.goal}`);
  L.push("");

  if (files.length === 0) {
    L.push("No matching files found.");
    return L.join("\n");
  }

  const top = files[0];
  const snip = snippets.get(top.path);
  const purpose = getPurpose(top.path, data);

  L.push("## Error Source");
  L.push(`1. **${fileLabel(top.path, snip)}**${purpose ? ` \u2014 ${purpose}` : ""}`);

  const exports = getExports(top.path, data);
  if (exports.length) L.push(`   Exports: ${exports.slice(0, 5).join(", ")}`);

  const imports = renderImports(top.path, data);
  if (imports) L.push(`   ${imports}`);

  const sliceStr = renderSlice(top.path, data);
  if (sliceStr) L.push(sliceStr);

  if (files.length > 1) {
    L.push("");
    L.push("## Also References");
    for (let i = 1; i < Math.min(files.length, 5); i++) {
      const f = files[i];
      const s = snippets.get(f.path);
      const p = getPurpose(f.path, data);
      L.push(`${i + 1}. **${fileLabel(f.path, s)}**${p ? ` \u2014 ${p}` : ""}`);
    }
  }

  return L.join("\n");
}

function formatStackTrace(data: ContextData): string {
  const L: string[] = [];
  const files = data.files;
  const snippets = data.snippets ?? new Map();

  L.push("# Stack Trace");
  L.push("");

  if (files.length === 0) {
    L.push("No matching files found.");
    return L.join("\n");
  }

  const top = files[0];
  const snip = snippets.get(top.path);
  const purpose = getPurpose(top.path, data);

  L.push("## Crash Point");
  L.push(`**${fileLabel(top.path, snip)}**${purpose ? ` \u2014 ${purpose}` : ""}`);

  if (snip?.symbol) {
    L.push(`  \`${snip.symbol}\``);
  }

  const sliceStr = renderSlice(top.path, data);
  if (sliceStr) L.push(sliceStr);

  // Call chain from import graph
  const chain: string[] = [];
  const fwd = data.forwardImports.get(top.path);
  const rev = data.reverseImports.get(top.path);
  if (rev?.length || fwd?.length) {
    const callers = rev?.slice(0, 2) ?? [];
    const deps = fwd?.slice(0, 2) ?? [];
    if (callers.length || deps.length) {
      const parts = [...callers.map((c) => `${c} \u2192`), top.path, ...deps.map((d) => `\u2192 ${d}`)];
      chain.push(parts.join(" "));
    }
  }
  if (chain.length) {
    L.push("");
    L.push("## Call Chain");
    for (const c of chain) L.push(c);
  }

  // Related files (with slices for stack_trace — up to 2 total)
  if (files.length > 1) {
    L.push("");
    L.push("## Related");
    for (let i = 1; i < Math.min(files.length, 5); i++) {
      const f = files[i];
      const p = getPurpose(f.path, data);
      const cochangeStr = renderCochanges(f.path, data.cochanges, 1);
      L.push(`- ${f.path}${p ? ` \u2014 ${p}` : ""}${cochangeStr ? ` (${cochangeStr})` : ""}`);
      const relSlice = renderSlice(f.path, data);
      if (relSlice) L.push(relSlice);
    }
  }

  return L.join("\n");
}

// --- Progressive Stripping ---

function stripCodeSlices(lines: string[]): string[] {
  const result: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (line.trimStart().startsWith("```") && !inFence) {
      inFence = true;
      continue;
    }
    if (inFence && line.trimStart().startsWith("```")) {
      inFence = false;
      continue;
    }
    if (!inFence) result.push(line);
  }
  return result;
}

function progressiveStrip(output: string, _data: ContextData): string {
  let lines = output.split("\n");

  // 1. Strip code slices (fenced blocks) — highest token cost
  if (estimateTokens(lines.join("\n")) > TOKEN_CAP) {
    lines = stripCodeSlices(lines);
  }

  // 2. Truncate co-change lines (keep top 1 per file)
  if (estimateTokens(lines.join("\n")) > TOKEN_CAP) {
    lines = lines.map((l) => {
      if (l.trimStart().startsWith("Co-changes:")) {
        const match = l.match(/Co-changes:\s*([^,]+)/);
        if (match) return `${l.substring(0, l.indexOf("Co-changes:"))}Co-changes: ${match[1].trim()}`;
      }
      return l;
    });
  }

  // 3. Drop test files section
  if (estimateTokens(lines.join("\n")) > TOKEN_CAP) {
    const testIdx = lines.findIndex((l) => l.startsWith("## Tests"));
    if (testIdx >= 0) {
      let endIdx = lines.findIndex((l, i) => i > testIdx && l.startsWith("## "));
      if (endIdx < 0) endIdx = lines.length;
      lines.splice(testIdx, endIdx - testIdx);
    }
  }

  // 4. Truncate import arrows (keep top 2 per direction)
  if (estimateTokens(lines.join("\n")) > TOKEN_CAP) {
    lines = lines.filter((l) => {
      const trimmed = l.trimStart();
      return !(trimmed.startsWith("\u2190") || trimmed.startsWith("\u2192")) || !trimmed.includes("|");
    });
  }

  // 5. Reduce to top 5 files
  if (estimateTokens(lines.join("\n")) > TOKEN_CAP) {
    const reduced: string[] = [];
    let fileCount = 0;
    for (const line of lines) {
      if (/^\d+\./.test(line.trimStart())) {
        fileCount++;
        if (fileCount > 5) continue;
      }
      reduced.push(line);
    }
    lines = reduced;
  }

  // 6. Drop purpose summaries (last resort)
  if (estimateTokens(lines.join("\n")) > TOKEN_CAP) {
    lines = lines.map((l) => {
      const dashIdx = l.indexOf(" \u2014 ");
      if (dashIdx > 0 && (l.includes("**") || /^\d+\./.test(l.trimStart()))) {
        return l.substring(0, dashIdx);
      }
      return l;
    });
  }

  return lines.join("\n");
}

// --- Score relevance filter (unchanged) ---

function filterByScoreRelevance(data: ContextData): ContextData {
  if (!data.scores || data.scores.size === 0) return data;
  const topScore = Math.max(...data.scores.values());
  if (topScore <= 0) return data;
  const threshold = topScore * 0.15;
  const filtered = data.files.filter((f) => {
    const score = data.scores?.get(f.path);
    if (score === undefined) return data.files.indexOf(f) < 5;
    return score >= threshold;
  });
  return { ...data, files: filtered };
}

// --- Entry point ---

export function formatContextPack(data: ContextData): string {
  const filtered = filterByScoreRelevance(data);

  let output: string;
  switch (filtered.queryKind) {
    case "symbol":
      output = formatSymbol(filtered);
      break;
    case "error_message":
      output = formatError(filtered);
      break;
    case "stack_trace":
      output = formatStackTrace(filtered);
      break;
    default:
      output = formatNatural(filtered);
      break;
  }

  if (estimateTokens(output) > TOKEN_CAP) {
    output = progressiveStrip(output, filtered);
  }

  return output;
}
