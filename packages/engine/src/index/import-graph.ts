import type { Db } from "../db/connection";
import { chunkQueries, importQueries } from "../db/queries";
import { extractImportSpecifiers, resolveImport } from "./imports";
import { detectLanguage } from "./discovery";

export function buildAndPersistImportGraph(db: Db, repoId: string): number {
  const rows = chunkQueries.getAllByRepo(db, repoId);

  const files = new Map<string, { content: string; language: string }>();
  for (const row of rows) {
    const existing = files.get(row.path);
    if (existing) {
      existing.content += "\n" + row.content;
    } else {
      files.set(row.path, {
        content: row.content,
        language: row.language ?? detectLanguage(row.path) ?? "text",
      });
    }
  }

  const knownPaths = new Set(files.keys());

  importQueries.deleteByRepo(db, repoId);

  let edgeCount = 0;
  for (const [sourcePath, { content, language }] of files) {
    const specs = extractImportSpecifiers(content, language);
    for (const spec of specs) {
      const targetPath = resolveImport(sourcePath, spec, language, knownPaths);
      if (targetPath && targetPath !== sourcePath) {
        importQueries.insert(db, repoId, sourcePath, targetPath);
        edgeCount++;
      }
    }
  }

  return edgeCount;
}
