import type { Db } from "../db/connection.js";
import { chunkQueries, importQueries } from "../db/queries.js";
import { extractImportSpecifiers, resolveImport } from "./imports.js";

const SUPPORTED_LANGUAGES = new Set([
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
  "python",
  "go",
  "rust",
]);

/**
 * Builds the import graph for a repo: merges chunks per file, extracts imports,
 * resolves paths, deduplicates, and persists edges to fileImports table.
 * Synchronous — called from lensFn-wrapped orchestrators.
 */
export function buildAndPersistImportGraph(db: Db, repoId: string): void {
  // Clear existing edges before rebuild
  importQueries.clearForRepo(db, repoId);

  // Get all chunks ordered by path + chunk_index (getAllByRepo guarantees order)
  const rows = chunkQueries.getAllByRepo(db, repoId);

  // Merge chunks per file — NEVER extract per-chunk (imports may span chunk boundaries)
  const files = new Map<string, { content: string; language: string | null }>();
  for (const row of rows) {
    const existing = files.get(row.path);
    if (existing) {
      existing.content += `\n${row.content}`;
    } else {
      files.set(row.path, { content: row.content, language: row.language });
    }
  }

  // Build known paths set for resolution
  const knownPaths = new Set(files.keys());

  // Build edges
  const edges: Array<{ sourcePath: string; targetPath: string }> = [];
  const seen = new Set<string>();

  for (const [sourcePath, { content, language }] of files) {
    if (!SUPPORTED_LANGUAGES.has(language ?? "")) continue;

    const specifiers = extractImportSpecifiers(content, language);
    for (const spec of specifiers) {
      const targetPath = resolveImport(spec, sourcePath, knownPaths);
      if (!targetPath || targetPath === sourcePath) continue;

      const edgeKey = `${sourcePath}\0${targetPath}`;
      if (!seen.has(edgeKey)) {
        seen.add(edgeKey);
        edges.push({ sourcePath, targetPath });
      }
    }
  }

  if (edges.length > 0) {
    importQueries.insertEdges(db, repoId, edges);
  }
}
