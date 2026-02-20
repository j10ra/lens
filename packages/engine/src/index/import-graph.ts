import type { Db } from "../db/connection.js"
import { importQueries, metadataQueries } from "../db/queries.js"
import { getParser } from "../parsers/registry.js"

export function buildAndPersistImportGraph(db: Db, repoId: string): void {
  importQueries.clearForRepo(db, repoId)

  const allMeta = metadataQueries.getAllForRepo(db, repoId)
  const knownPaths = new Set(allMeta.map((m) => m.path))

  const edges: Array<{ sourcePath: string; targetPath: string }> = []
  const seen = new Set<string>()

  for (const meta of allMeta) {
    const parser = getParser(meta.language)
    if (!parser) continue

    const specifiers: string[] = JSON.parse(meta.imports ?? "[]")
    for (const spec of specifiers) {
      const targetPath = parser.resolveImport(spec, meta.path, knownPaths)
      if (!targetPath || targetPath === meta.path) continue

      const edgeKey = `${meta.path}\0${targetPath}`
      if (!seen.has(edgeKey)) {
        seen.add(edgeKey)
        edges.push({ sourcePath: meta.path, targetPath })
      }
    }
  }

  if (edges.length > 0) {
    importQueries.insertEdges(db, repoId, edges)
  }
}
