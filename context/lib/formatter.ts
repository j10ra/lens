import type { InterpretedQuery } from "./query-interpreter";
import type { CochangeRow, FileStatRow } from "./structural";
import type { RepoScripts } from "../../repo/lib/scripts";

export interface ContextData {
  goal: string;
  files: Array<{ path: string; reason: string }>;
  reverseImports: Map<string, string[]>;
  cochanges: CochangeRow[];
  fileStats: Map<string, FileStatRow>;
  scripts?: RepoScripts;
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.substring(i + 1) : p;
}

export function formatContextPack(data: ContextData): string {
  const L: string[] = [];

  // Header
  L.push(`# ${data.goal}`);
  L.push("");

  // Where to Look
  const files = data.files.slice(0, 5);
  if (files.length > 0) {
    L.push("## Where to Look");
    for (let i = 0; i < files.length; i++) {
      L.push(`${i + 1}. ${files[i].path}`);
      L.push(`   ${files[i].reason}`);
    }
    L.push("");
  }

  // Impact — reverse deps for top files
  const impactLines: string[] = [];
  for (const f of files.slice(0, 3)) {
    const importers = data.reverseImports.get(f.path);
    if (importers && importers.length > 0) {
      const names = importers.slice(0, 4).map(basename).join(", ");
      impactLines.push(`${basename(f.path)} <- ${names}`);
    }
  }
  if (impactLines.length > 0) {
    L.push("## Impact");
    for (const line of impactLines) L.push(line);
    L.push("");
  }

  // History — hot files + co-changes
  const historyLines: string[] = [];
  for (const f of files.slice(0, 3)) {
    const stat = data.fileStats.get(f.path);
    if (!stat || stat.recent_count === 0) continue;

    const coPartners = data.cochanges
      .filter((c) => c.path === f.path)
      .slice(0, 2)
      .map((c) => `${basename(c.partner)} (${c.count}x)`)
      .join(", ");

    const coStr = coPartners ? `, co-changes: ${coPartners}` : "";
    historyLines.push(`${basename(f.path)}: ${stat.recent_count} commits/90d${coStr}`);
  }
  if (historyLines.length > 0) {
    L.push("## History");
    for (const line of historyLines) L.push(line);
    L.push("");
  }

  // Tools
  L.push("## Tools");
  L.push('rlm search "<query>" | rlm read <path> | rlm run "<cmd>"');
  if (data.scripts) {
    const parts: string[] = [];
    if (data.scripts.test) parts.push(`test: ${data.scripts.test}`);
    if (data.scripts.build) parts.push(`build: ${data.scripts.build}`);
    if (data.scripts.lint) parts.push(`lint: ${data.scripts.lint}`);
    if (parts.length > 0) L.push(parts.join(" | "));
  }

  return L.join("\n");
}
