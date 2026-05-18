export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "namespace"
  | "const"
  | "let"
  | "var"
  | "method";

export interface ParsedSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  exported: boolean;
}

export interface LanguageParser {
  /** Language identifiers this parser handles (e.g. ["typescript", "javascript", "tsx", "jsx"]) */
  languages: string[];

  extractImports(content: string): string[];
  extractExports(content: string): string[];
  extractDocstring(content: string): string;
  extractSections(content: string): string[];
  extractInternals(content: string, exports: string[]): string[];
  /** Optional richer symbol extraction (name + kind + declaration line). */
  extractSymbols?(content: string): ParsedSymbol[];
  /** Optional: language-specific namespace declarations (C#, F#, VB.NET). Returns flat namespace strings (e.g. ["App.Models", "App.Models.Internal"]). */
  extractNamespaces?(content: string): string[];
  resolveImport(specifier: string, sourcePath: string, knownPaths: Set<string>): string | null;
}
