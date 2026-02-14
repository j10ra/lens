import type { ContextData, ResolvedSnippet } from "../types";

type Confidence = "high" | "moderate" | "low";
const TOKEN_CAP = 350;

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.substring(i + 1) : p;
}

function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function detectConfidence(scores: Map<string, number> | undefined): Confidence {
  if (!scores || scores.size === 0) return "low";
  const vals = [...scores.values()].sort((a, b) => b - a);
  if (vals.length === 1) return "high";
  const top = vals[0];
  const second = vals[1] || 0;
  const ratio = top / (second || 1);

  // Strong absolute signal (query-kind boosts produce scores >50)
  if (top >= 60 || (top >= 40 && ratio >= 2.0)) return "high";
  if (ratio >= 2.5) return "high";
  if (top >= 25 && ratio >= 1.5) return "moderate";
  if (ratio >= 1.5) return "moderate";
  return "low";
}

function fileLabel(path: string, snippet?: ResolvedSnippet): string {
  const sym = snippet?.symbol ? ` → ${snippet.symbol}()` : "";
  const line = snippet?.line ? `:${snippet.line}` : "";
  return `${path}${line}${sym}`;
}

function formatHigh(data: ContextData): string {
  const L: string[] = [];
  const files = data.files.slice(0, 5);
  const snippets = data.snippets ?? new Map();
  const purposeMap = new Map<string, string>();
  for (const m of data.metadata) {
    if (m.purpose) purposeMap.set(m.path, m.purpose);
  }

  L.push(`# ${data.goal}`);
  L.push("");

  // Start here — top file
  const top = files[0];
  if (top) {
    const snip = snippets.get(top.path);
    L.push("## Start here");
    L.push(`${fileLabel(top.path, snip)}`);
    L.push(`  ${top.reason}`);
    const purpose = purposeMap.get(top.path);
    if (purpose) L.push(`  ${purpose}`);
    L.push("");
  }

  // Chain — importers of top file
  const chainFiles = files.slice(1);
  const chainLines: string[] = [];
  for (const f of chainFiles) {
    const rev = data.reverseImports.get(files[0]?.path ?? "");
    const isImporter = rev?.includes(f.path);
    const hop2 = data.hop2Deps.get(files[0]?.path ?? "");
    const isHop2 = hop2?.includes(f.path);
    const snip = snippets.get(f.path);
    if (isImporter) {
      chainLines.push(`← ${fileLabel(f.path, snip)} (imports ${basename(files[0].path)})`);
    } else if (isHop2) {
      chainLines.push(`← ${fileLabel(f.path, snip)} (2-hop)`);
    }
  }
  if (chainLines.length > 0) {
    L.push("## Chain");
    for (const line of chainLines) L.push(line);
    L.push("");
  }

  // Tests
  const tests = data.testFiles?.get(files[0]?.path ?? "");
  if (tests?.length) {
    L.push("## Tests");
    for (const t of tests) L.push(basename(t));
    L.push("");
  }

  // Blast radius
  const consumers = data.reverseImports.get(files[0]?.path ?? "");
  if (consumers?.length) {
    L.push(`## Blast radius: ${consumers.length} consumer${consumers.length > 1 ? "s" : ""}`);
  }

  return L.join("\n");
}

function formatModerate(data: ContextData): string {
  const L: string[] = [];
  const files = data.files.slice(0, 5);
  const snippets = data.snippets ?? new Map();
  const purposeMap = new Map<string, string>();
  for (const m of data.metadata) {
    if (m.purpose) purposeMap.set(m.path, m.purpose);
  }

  L.push(`# ${data.goal}`);
  L.push("");

  const mostLikely = files.slice(0, 2);
  const alsoRelevant = files.slice(2);

  if (mostLikely.length > 0) {
    L.push("## Most likely");
    for (let i = 0; i < mostLikely.length; i++) {
      const f = mostLikely[i];
      const snip = snippets.get(f.path);
      L.push(`${i + 1}. ${fileLabel(f.path, snip)} — ${f.reason}`);

      // Inline chain + tests
      const parts: string[] = [];
      const rev = data.reverseImports.get(f.path);
      const fwd = data.forwardImports.get(f.path);
      if (rev?.length || fwd?.length) {
        const deps = [...(fwd?.slice(0, 2).map(basename) ?? []), ...(rev?.slice(0, 2).map(basename) ?? [])];
        parts.push(deps.join(", "));
      }
      const tests = data.testFiles?.get(f.path);
      if (tests?.length) parts.push(`tests: ${tests.map(basename).join(", ")}`);
      if (parts.length > 0) L.push(`   ← ${parts.join(" | ")}`);

      const purpose = purposeMap.get(f.path);
      if (purpose) L.push(`   ${purpose}`);
    }
    L.push("");
  }

  if (alsoRelevant.length > 0) {
    L.push("## Also relevant");
    for (let i = 0; i < alsoRelevant.length; i++) {
      const f = alsoRelevant[i];
      const snip = snippets.get(f.path);
      L.push(`${mostLikely.length + i + 1}. ${fileLabel(f.path, snip)} — ${f.reason}`);
    }
  }

  return L.join("\n");
}

function formatLow(data: ContextData): string {
  const L: string[] = [];
  const files = data.files.slice(0, 7);
  const snippets = data.snippets ?? new Map();

  L.push(`# ${data.goal}`);
  L.push("");
  L.push("## Candidates (ranked)");
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const snip = snippets.get(f.path);
    L.push(`${i + 1}. ${fileLabel(f.path, snip)} — ${f.reason}`);
  }

  return L.join("\n");
}

function progressiveStrip(output: string, _data: ContextData): string {
  let result = output;

  // Strip purpose lines first
  if (estimateTokens(result) > TOKEN_CAP) {
    result = result
      .split("\n")
      .filter((l) => {
        const trimmed = l.trimStart();
        // Remove purpose lines (indented non-header, non-numbered, non-arrow lines)
        if (l.startsWith("   ") && !trimmed.startsWith("←") && !trimmed.match(/^\d+\./)) {
          // Keep reason lines (directly after numbered items)
          return false;
        }
        return true;
      })
      .join("\n");
  }

  // Strip chain section
  if (estimateTokens(result) > TOKEN_CAP) {
    const chainIdx = result.indexOf("## Chain");
    if (chainIdx >= 0) {
      const nextSection = result.indexOf("\n## ", chainIdx + 1);
      result =
        nextSection >= 0
          ? result.substring(0, chainIdx) + result.substring(nextSection + 1)
          : result.substring(0, chainIdx);
    }
  }

  // Reduce to top 3 files
  if (estimateTokens(result) > TOKEN_CAP) {
    const lines = result.split("\n");
    const reduced: string[] = [];
    let fileCount = 0;
    for (const line of lines) {
      if (/^\d+\./.test(line.trimStart())) {
        fileCount++;
        if (fileCount > 3) continue;
      }
      reduced.push(line);
    }
    result = reduced.join("\n");
  }

  return result;
}

function filterByScoreRelevance(data: ContextData): ContextData {
  if (!data.scores || data.scores.size === 0) return data;
  const topScore = Math.max(...data.scores.values());
  if (topScore <= 0) return data;
  const threshold = topScore * 0.15;
  const filtered = data.files.filter((f) => {
    const score = data.scores?.get(f.path);
    // Keep files without scores (co-change/semantic promoted) only if in top 5
    if (score === undefined) return data.files.indexOf(f) < 5;
    return score >= threshold;
  });
  return { ...data, files: filtered };
}

export function formatContextPack(data: ContextData): string {
  const filtered = filterByScoreRelevance(data);
  const confidence = detectConfidence(filtered.scores);

  let output: string;
  switch (confidence) {
    case "high":
      output = formatHigh(filtered);
      break;
    case "moderate":
      output = formatModerate(filtered);
      break;
    default:
      output = formatLow(filtered);
      break;
  }

  if (estimateTokens(output) > TOKEN_CAP) {
    output = progressiveStrip(output, data);
  }

  return output;
}
