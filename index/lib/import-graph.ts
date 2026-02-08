import { db } from "../../repo/db";
import { extractImportSpecifiers, resolveImport } from "../../context/lib/imports";
import { detectLanguage } from "./discovery";

/** Build repo-wide import graph from chunks, persist directed edges to file_imports */
export async function buildAndPersistImportGraph(repoId: string): Promise<number> {
  // 1. Collect all file contents from chunks
  const files = new Map<string, { content: string; language: string }>();
  const rows = db.query<{ path: string; content: string; language: string | null; chunk_index: number }>`
    SELECT path, content, language, chunk_index FROM chunks
    WHERE repo_id = ${repoId}
    ORDER BY path, chunk_index
  `;
  for await (const row of rows) {
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

  // 2. Delete existing edges for this repo
  await db.exec`DELETE FROM file_imports WHERE repo_id = ${repoId}`;

  // 3. Extract + resolve imports, batch insert edges
  let edgeCount = 0;
  for (const [sourcePath, { content, language }] of files) {
    const specs = extractImportSpecifiers(content, language);
    for (const spec of specs) {
      const targetPath = resolveImport(sourcePath, spec, language, knownPaths);
      if (targetPath && targetPath !== sourcePath) {
        await db.exec`
          INSERT INTO file_imports (repo_id, source_path, target_path)
          VALUES (${repoId}, ${sourcePath}, ${targetPath})
          ON CONFLICT DO NOTHING
        `;
        edgeCount++;
      }
    }
  }

  return edgeCount;
}
