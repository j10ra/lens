// ── Section extraction (language-agnostic) ────────────────────────────
const SECTION_SINGLE_RE = /^(?:\/\/|#)\s*[-=]{3,}\s*(.+?)\s*[-=]{3,}\s*$/gm;
const SECTION_BLOCK_RE = /^\/\*\s*[-=]{3,}\s*(.+?)\s*[-=]{3,}\s*\*\/$/gm;

export function extractSections(content: string): string[] {
  const seen = new Set<string>();
  const sections: string[] = [];

  for (const re of [SECTION_SINGLE_RE, SECTION_BLOCK_RE]) {
    const pattern = new RegExp(re.source, re.flags);
    for (const m of content.matchAll(pattern)) {
      const label = m[1]?.trim();
      if (label && !seen.has(label)) {
        seen.add(label);
        sections.push(label);
      }
    }
  }

  return sections.slice(0, 15);
}

// ── Internals extraction (universal declarations) ─────────────────────
const UNIVERSAL_DECL_RES: RegExp[] = [
  /^\s*(?:async\s+)?(?:function|def|fn|func|fun)\s+(\w+)/gm,
  /^\s*(?:const|let|var|val)\s+(\w+)\s*[=:]/gm,
  /^\s*(?:abstract\s+|sealed\s+|partial\s+|data\s+)?(?:class|struct|enum|trait|interface|record|object|mod)\s+(\w+)/gm,
  /^\s*type\s+(\w+)\s*[=<{]/gm,
];

const EXPORT_LINE_RE = /^(?:export|pub\s|public\s)/;
const SKIP_NAMES = new Set([
  "if",
  "for",
  "foreach",
  "while",
  "switch",
  "using",
  "catch",
  "lock",
  "return",
  "throw",
  "yield",
  "try",
  "do",
  "else",
  "new",
  "await",
  "base",
  "this",
  "super",
  "self",
  "import",
  "require",
  "from",
  "package",
]);

export function extractUniversalInternals(content: string, exports: string[]): string[] {
  const exportSet = new Set(exports);
  const seen = new Set<string>();
  const results: string[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
    if (trimmed.startsWith("#") && !trimmed.startsWith("#!")) continue;
    if (EXPORT_LINE_RE.test(trimmed)) continue;

    for (const re of UNIVERSAL_DECL_RES) {
      const pattern = new RegExp(re.source, re.flags);
      for (const m of line.matchAll(pattern)) {
        const name = m[1];
        if (
          name &&
          name.length >= 3 &&
          !exportSet.has(name) &&
          !seen.has(name) &&
          !SKIP_NAMES.has(name) &&
          !name.startsWith("_")
        ) {
          seen.add(name);
          results.push(name);
        }
      }
    }
  }

  return results.slice(0, 20);
}
