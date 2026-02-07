import { db } from "../../repo/db";
import { grepSearch } from "./grep";
import { vectorSearch, hasEmbeddings } from "./vector";
import { mergeAndRerank, formatResult, type RankedResult } from "./rerank";
import { buildImportGraph, expandByImports, extractImportSpecifiers } from "./imports";
import type { TaskAnalysis } from "./analyzer";

export interface GatheredContext {
  repoMap: string;
  relevantFiles: RelevantFile[];
  importGraph: Map<string, Set<string>>;
}

export interface RelevantFile {
  path: string;
  key_exports: string[];
  static_imports: string[];
  snippets: Snippet[];
  role: "hit" | "neighbor";
}

export interface Snippet {
  start_line: number;
  end_line: number;
  content: string;
  match_type: string;
}

const MAX_SNIPPET_LINES = 10;
const MAX_FILES = 8;
const MAX_SNIPPETS_PER_FILE = 2;
const MAX_NEIGHBOR_EXPANSION = 5;

export async function gatherContext(
  repoId: string,
  repoMap: string,
  analysis: TaskAnalysis,
  fileCount = 0,
): Promise<GatheredContext> {
  const maxFiles = fileCount < 200 ? 5 : MAX_FILES;
  const maxNeighborExpansion = fileCount < 200 ? 0 : MAX_NEIGHBOR_EXPANSION;

  // 1. Search full goal first (best semantic signal), then supplement with keywords
  const allHitPaths = new Set<string>();
  const snippetsByPath = new Map<string, Snippet[]>();
  const pathScores = new Map<string, number>();

  const embeddingsReady = await hasEmbeddings(repoId).catch(() => false);

  const searchHybrid = async (query: string, lim: number) => {
    if (embeddingsReady) {
      const [grep, vec] = await Promise.all([
        grepSearch(repoId, query, lim, true),
        vectorSearch(repoId, query, lim, true),
      ]);
      const grepScored = grep.map((r) => ({ ...r, match_type: "grep" as const }));
      const vecScored = vec.map((r) => ({ ...r, match_type: "semantic" as const }));
      return mergeAndRerank(grepScored, vecScored, lim, query);
    }
    const grep = await grepSearch(repoId, query, lim, true);
    return grep.map((r) => formatResult(r, r.score, "grep", query));
  };

  const collectResults = (results: RankedResult[]) => {
    for (const r of results) {
      allHitPaths.add(r.path);
      pathScores.set(r.path, (pathScores.get(r.path) ?? 0) + r.score);
      const existing = snippetsByPath.get(r.path) ?? [];
      existing.push({
        start_line: r.start_line,
        end_line: r.end_line,
        content: r.snippet,
        match_type: r.match_type,
      });
      snippetsByPath.set(r.path, existing);
    }
  };

  // Full goal search (multi-word grep + semantic)
  const fullGoal = analysis.keywords.join(" ");
  collectResults(await searchHybrid(fullGoal, 15));

  // Supplement with individual keyword searches
  for (const keyword of analysis.keywords.slice(0, 3)) {
    if (allHitPaths.size >= maxFiles * 2) break;
    collectResults(await searchHybrid(keyword, 5));
  }

  // Add likely_files from analysis
  for (const fp of analysis.likely_files) allHitPaths.add(fp);

  // 2. Get all known paths for import resolution
  const knownPathRows: string[] = [];
  const knownCursor = db.query<{ path: string }>`
    SELECT DISTINCT path FROM chunks WHERE repo_id = ${repoId}
  `;
  for await (const row of knownCursor) knownPathRows.push(row.path);
  const knownPaths = new Set(knownPathRows);

  // 3. For top-k hit files, fetch chunk content + summaries
  const hitPaths = [...allHitPaths]
    .sort((a, b) => (pathScores.get(b) ?? 0) - (pathScores.get(a) ?? 0))
    .slice(0, maxFiles);

  // Fetch chunk content for import graph building
  const fileContents = new Map<string, { content: string; language: string }>();
  if (hitPaths.length > 0) {
    const contentCursor = db.query<{ path: string; content: string; language: string | null; chunk_index: number }>`
      SELECT path, content, language, chunk_index FROM chunks
      WHERE repo_id = ${repoId} AND path = ANY(${hitPaths})
      ORDER BY path, chunk_index
    `;
    for await (const row of contentCursor) {
      const existing = fileContents.get(row.path);
      if (existing) {
        existing.content += "\n" + row.content;
      } else {
        fileContents.set(row.path, { content: row.content, language: row.language ?? "text" });
      }
    }
  }

  // 4. Build import graph
  const graphFiles = [...fileContents.entries()].map(([path, { content, language }]) => ({
    path, content, language,
  }));
  const importGraph = buildImportGraph(graphFiles, knownPaths);

  // 5. Expand by imports — get neighbor paths
  const neighborPaths = expandByImports(hitPaths, importGraph, maxNeighborExpansion);

  // 6. Build RelevantFile for hits
  const relevantFiles: RelevantFile[] = [];

  for (const filePath of hitPaths) {
    const summaryRow = await db.queryRow<{
      key_exports: string | string[];
    }>`
      SELECT key_exports FROM summaries
      WHERE repo_id = ${repoId} AND path = ${filePath} AND level = 'file'
      ORDER BY updated_at DESC LIMIT 1
    `;

    const keyExports = parseJsonb(summaryRow?.key_exports ?? null);

    // Extract static imports from chunk content
    const fc = fileContents.get(filePath);
    const staticImports = fc
      ? extractImportSpecifiers(fc.content, fc.language)
      : [];

    // Snippets — capped at MAX_SNIPPETS_PER_FILE, MAX_SNIPPET_LINES each
    const rawSnippets = snippetsByPath.get(filePath) ?? [];
    const trimmed = dedupeSnippets(rawSnippets).slice(0, MAX_SNIPPETS_PER_FILE).map((s) => ({
      ...s,
      content: s.content.split("\n").slice(0, MAX_SNIPPET_LINES).join("\n"),
    }));

    relevantFiles.push({
      path: filePath,
      key_exports: keyExports,
      static_imports: [...new Set(staticImports)],
      snippets: trimmed,
      role: "hit",
    });
  }

  // 7. Neighbors — key_exports only, no snippets
  for (const nPath of neighborPaths) {
    const summaryRow = await db.queryRow<{
      key_exports: string | string[];
    }>`
      SELECT key_exports FROM summaries
      WHERE repo_id = ${repoId} AND path = ${nPath} AND level = 'file'
      ORDER BY updated_at DESC LIMIT 1
    `;

    relevantFiles.push({
      path: nPath,
      key_exports: parseJsonb(summaryRow?.key_exports ?? null),
      static_imports: [],
      snippets: [],
      role: "neighbor",
    });
  }

  return { repoMap, relevantFiles, importGraph };
}

function parseJsonb(v: string | string[] | null): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return []; }
}

function dedupeSnippets(snippets: Snippet[]): Snippet[] {
  if (snippets.length <= 1) return snippets;

  const sorted = [...snippets].sort((a, b) => a.start_line - b.start_line);
  const result: Snippet[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const curr = sorted[i];
    if (curr.start_line <= prev.end_line + 5) {
      if (curr.content.length > prev.content.length) {
        result[result.length - 1] = curr;
      }
    } else {
      result.push(curr);
    }
  }

  return result;
}
