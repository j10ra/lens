export interface LanguageParser {
  /** Language identifiers this parser handles (e.g. ["typescript", "javascript", "tsx", "jsx"]) */
  languages: string[]

  extractImports(content: string): string[]
  extractExports(content: string): string[]
  extractDocstring(content: string): string
  extractSections(content: string): string[]
  extractInternals(content: string, exports: string[]): string[]
  resolveImport(specifier: string, sourcePath: string, knownPaths: Set<string>): string | null
}
