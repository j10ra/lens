import type { ParsedSymbol, SymbolKind } from "../types.js";

// Regex-based extraction: ast-grep patterns don't reliably capture leading
// modifiers (public/internal/private) as part of the matched node text when
// the declaration is nested inside a namespace block. Regex is simpler and
// equally accurate for top-level type declarations.

interface DeclPattern {
  kind: SymbolKind;
  re: RegExp;
}

const DECL_PATTERNS: DeclPattern[] = [
  {
    kind: "class",
    re: /^[ \t]*(?:(public|internal|private|protected(?:\s+internal)?)\s+)?(?:abstract\s+|sealed\s+|static\s+|partial\s+)*class\s+(\w+)/m,
  },
  {
    kind: "interface",
    re: /^[ \t]*(?:(public|internal|private|protected(?:\s+internal)?)\s+)?(?:partial\s+)*interface\s+(\w+)/m,
  },
  {
    kind: "type",
    re: /^[ \t]*(?:(public|internal|private|protected(?:\s+internal)?)\s+)?(?:readonly\s+|ref\s+)?struct\s+(\w+)/m,
  },
  { kind: "enum", re: /^[ \t]*(?:(public|internal|private|protected(?:\s+internal)?)\s+)?enum\s+(\w+)/m },
  {
    kind: "type",
    re: /^[ \t]*(?:(public|internal|private|protected(?:\s+internal)?)\s+)?(?:abstract\s+|sealed\s+|partial\s+)*record\s+(\w+)/m,
  },
];

export function extractCsharpSymbols(content: string): ParsedSymbol[] {
  const lines = content.split(/\r?\n/);
  const out: ParsedSymbol[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { kind, re } of DECL_PATTERNS) {
      const m = line.match(re);
      if (!m) continue;
      const accessModifier = m[1];
      const name = m[2];
      const lineNum = i + 1;
      const key = `${kind}:${name}:${lineNum}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const exported = accessModifier === "public";
      out.push({ name, kind, line: lineNum, exported });
      break; // one declaration per line
    }
  }

  return out;
}
