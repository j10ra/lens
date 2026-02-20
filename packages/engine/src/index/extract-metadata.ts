import type { Db } from "../db/connection.js"
import { metadataQueries } from "../db/queries.js"
import { extractSections, extractUniversalInternals } from "../parsers/common/patterns.js"
import { getParser } from "../parsers/registry.js"

export interface FileMetadata {
  path: string
  language: string | null
  exports: string[]
  imports: string[]
  docstring: string
  sections: string[]
  internals: string[]
}

export function extractFileMetadata(content: string, path: string, language: string | null): FileMetadata {
  const parser = getParser(language)
  const exports = parser?.extractExports(content) ?? []

  return {
    path,
    language,
    exports,
    imports: parser?.extractImports(content) ?? [],
    docstring: parser?.extractDocstring(content) ?? "",
    sections: parser?.extractSections(content) ?? extractSections(content),
    internals: parser?.extractInternals(content, exports) ?? extractUniversalInternals(content, exports),
  }
}

export function extractAndPersistMetadata(
  db: Db,
  repoId: string,
  fileContents: Map<string, { content: string; language: string | null }>,
): number {
  let count = 0
  for (const [path, { content, language }] of fileContents) {
    const meta = extractFileMetadata(content, path, language)
    metadataQueries.upsert(db, repoId, path, {
      language: meta.language,
      exports: meta.exports,
      imports: meta.imports,
      docstring: meta.docstring,
      sections: meta.sections,
      internals: meta.internals,
    })
    count++
  }
  return count
}
