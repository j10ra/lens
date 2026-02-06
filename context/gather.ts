import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../repo/db";
import { grepSearch } from "../search/grep";
import { vectorSearch, hasEmbeddings } from "../search/vector";
import { mergeAndRerank, formatResult } from "../search/rerank";
import type { TaskAnalysis } from "./analyzer";

export interface GatheredContext {
  repoMap: string;
  relevantFiles: RelevantFile[];
  dependencyGraph: Map<string, string[]>;
}

export interface RelevantFile {
  path: string;
  summary: string;
  key_exports: string[];
  dependencies: string[];
  snippets: Snippet[];
}

interface Snippet {
  start_line: number;
  end_line: number;
  content: string;
  match_type: string;
}

const MAX_SNIPPET_LINES = 50;
const MAX_FILES = 10;

export async function gatherContext(
  repoId: string,
  repoMap: string,
  analysis: TaskAnalysis,
): Promise<GatheredContext> {
  const repo = await db.queryRow<{ root_path: string }>`
    SELECT root_path FROM repos WHERE id = ${repoId}
  `;
  if (!repo) throw new Error("repo not found");

  // 1. Search for each keyword — collect unique chunk hits
  const allHitPaths = new Set<string>();
  const snippetsByPath = new Map<string, Snippet[]>();

  const embeddingsReady = await hasEmbeddings(repoId).catch(() => false);

  for (const keyword of analysis.keywords.slice(0, 5)) {
    let results;
    if (embeddingsReady) {
      const [grep, vec] = await Promise.all([
        grepSearch(repoId, keyword, 10),
        vectorSearch(repoId, keyword, 10),
      ]);
      const grepScored = grep.map((r) => ({ ...r, match_type: "grep" as const }));
      const vecScored = vec.map((r) => ({ ...r, match_type: "semantic" as const }));
      results = mergeAndRerank(grepScored, vecScored, 10);
    } else {
      const grep = await grepSearch(repoId, keyword, 10);
      results = grep.map((r) => formatResult(r, r.score, "grep"));
    }

    for (const r of results) {
      allHitPaths.add(r.path);
      const existing = snippetsByPath.get(r.path) ?? [];
      existing.push({
        start_line: r.start_line,
        end_line: r.end_line,
        content: r.snippet,
        match_type: r.match_type,
      });
      snippetsByPath.set(r.path, existing);
    }
  }

  // Add likely_files from analysis
  for (const fp of analysis.likely_files) {
    allHitPaths.add(fp);
  }

  // 2. For each relevant file, fetch summary + read key snippets
  const targetPaths = [...allHitPaths].slice(0, MAX_FILES);
  const relevantFiles: RelevantFile[] = [];

  for (const filePath of targetPaths) {
    // Get cached summary
    const summaryRow = await db.queryRow<{
      summary: string;
      key_exports: string | string[];
      dependencies: string | string[];
    }>`
      SELECT summary, key_exports, dependencies FROM summaries
      WHERE repo_id = ${repoId} AND path = ${filePath} AND level = 'file'
      ORDER BY updated_at DESC LIMIT 1
    `;

    const parseJsonb = (v: string | string[] | null): string[] => {
      if (!v) return [];
      if (Array.isArray(v)) return v;
      try { return JSON.parse(v); } catch { return []; }
    };

    // Read actual file snippets for better context
    const snippets = snippetsByPath.get(filePath) ?? [];
    const enrichedSnippets: Snippet[] = [];

    for (const snip of snippets.slice(0, 3)) {
      try {
        const abs = resolve(repo.root_path, filePath);
        const raw = await readFile(abs, "utf-8");
        const lines = raw.split("\n");
        // Expand snippet to ±10 lines for context, capped at MAX_SNIPPET_LINES
        const start = Math.max(0, snip.start_line - 11);
        const end = Math.min(lines.length, snip.end_line + 10);
        const expanded = lines.slice(start, Math.min(end, start + MAX_SNIPPET_LINES));
        enrichedSnippets.push({
          start_line: start + 1,
          end_line: start + expanded.length,
          content: expanded.join("\n"),
          match_type: snip.match_type,
        });
      } catch {
        enrichedSnippets.push(snip);
      }
    }

    relevantFiles.push({
      path: filePath,
      summary: summaryRow?.summary ?? "",
      key_exports: parseJsonb(summaryRow?.key_exports ?? null),
      dependencies: parseJsonb(summaryRow?.dependencies ?? null),
      snippets: dedupeSnippets(enrichedSnippets),
    });
  }

  // 3. Build 1-level dependency graph from summaries
  const depGraph = new Map<string, string[]>();
  for (const rf of relevantFiles) {
    if (rf.dependencies.length > 0) {
      depGraph.set(rf.path, rf.dependencies);
    }
  }

  return { repoMap, relevantFiles, dependencyGraph: depGraph };
}

/** Deduplicate overlapping snippets by merging ranges */
function dedupeSnippets(snippets: Snippet[]): Snippet[] {
  if (snippets.length <= 1) return snippets;

  const sorted = [...snippets].sort((a, b) => a.start_line - b.start_line);
  const result: Snippet[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const curr = sorted[i];
    if (curr.start_line <= prev.end_line + 5) {
      // Overlapping or adjacent — keep the one with more content
      if (curr.content.length > prev.content.length) {
        result[result.length - 1] = curr;
      }
    } else {
      result.push(curr);
    }
  }

  return result;
}
