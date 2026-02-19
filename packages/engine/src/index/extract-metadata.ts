import type { Db } from "../db/connection.js";
import { chunkQueries, metadataQueries } from "../db/queries.js";
import { detectLanguage } from "./discovery.js";

// ── Export extraction ─────────────────────────────────────────────────────────

const TS_EXPORT_RE =
  /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|enum|namespace)\s+(\w+)/gm;
const PY_EXPORT_RE = /^(?:def|class)\s+(\w+)/gm;
const GO_EXPORT_RE = /^func\s+([A-Z]\w*)/gm;
const RUST_EXPORT_RE = /^pub\s+(?:fn|struct|enum|trait|type|mod)\s+(\w+)/gm;
const CSHARP_EXPORT_RE =
  /^\s*(?:public|internal)\s+(?:static\s+)?(?:abstract\s+|sealed\s+|partial\s+)?(?:class|interface|enum|struct|record|delegate)\s+(\w+)/gm;
const CSHARP_EXPORT_METHOD_RE =
  /^\s*public\s+(?:static\s+)?(?:async\s+)?(?:override\s+)?(?:virtual\s+)?[\w<>[\]?.]+\s+(\w+)\s*\(/gm;
const JAVA_EXPORT_RE =
  /^\s*(?:public)\s+(?:static\s+)?(?:abstract\s+|final\s+)?(?:class|interface|enum|record)\s+(\w+)/gm;

function extractExports(content: string, language: string): string[] {
  switch (language) {
    case "typescript":
    case "javascript":
    case "tsx":
    case "jsx": {
      const result: string[] = [];
      for (const m of content.matchAll(new RegExp(TS_EXPORT_RE.source, "gm"))) {
        if (m[1] && !result.includes(m[1])) result.push(m[1]);
      }
      return result.slice(0, 30);
    }
    case "python": {
      const result: string[] = [];
      for (const m of content.matchAll(new RegExp(PY_EXPORT_RE.source, "gm"))) {
        if (m[1] && !result.includes(m[1])) result.push(m[1]);
      }
      return result.slice(0, 30);
    }
    case "go": {
      const result: string[] = [];
      for (const m of content.matchAll(new RegExp(GO_EXPORT_RE.source, "gm"))) {
        if (m[1] && !result.includes(m[1])) result.push(m[1]);
      }
      return result.slice(0, 30);
    }
    case "rust": {
      const result: string[] = [];
      for (const m of content.matchAll(new RegExp(RUST_EXPORT_RE.source, "gm"))) {
        if (m[1] && !result.includes(m[1])) result.push(m[1]);
      }
      return result.slice(0, 30);
    }
    case "csharp": {
      const result: string[] = [];
      for (const pattern of [CSHARP_EXPORT_RE, CSHARP_EXPORT_METHOD_RE]) {
        for (const m of content.matchAll(new RegExp(pattern.source, "gm"))) {
          if (m[1] && !result.includes(m[1])) result.push(m[1]);
        }
      }
      return result.slice(0, 30);
    }
    case "java":
    case "kotlin": {
      const result: string[] = [];
      for (const m of content.matchAll(new RegExp(JAVA_EXPORT_RE.source, "gm"))) {
        if (m[1] && !result.includes(m[1])) result.push(m[1]);
      }
      return result.slice(0, 30);
    }
    default:
      return [];
  }
}

// ── Import extraction ─────────────────────────────────────────────────────────

const TS_IMPORT_RE = /(?:import\s+.*?from\s+|import\s+|export\s+.*?from\s+|require\s*\()['"]([^'"]+)['"]/g;
const PY_IMPORT_RE = /^(?:from\s+(\.[\w.]*)\s+import|import\s+([\w.]+))/gm;

function extractImports(content: string, language: string): string[] {
  switch (language) {
    case "typescript":
    case "javascript":
    case "tsx":
    case "jsx": {
      const specs: string[] = [];
      for (const m of content.matchAll(TS_IMPORT_RE)) {
        if (m[1]?.startsWith(".")) specs.push(m[1]);
      }
      return specs;
    }
    case "python": {
      const specs: string[] = [];
      for (const m of content.matchAll(PY_IMPORT_RE)) {
        const spec = m[1] ?? m[2];
        if (spec?.startsWith(".")) specs.push(spec);
      }
      return specs;
    }
    default:
      return [];
  }
}

// ── Docstring extraction ──────────────────────────────────────────────────────

const JSDOC_RE = /^\/\*\*\s*([\s\S]*?)\*\//m;
const PY_DOCSTRING_RE = /^(?:["']{3})([\s\S]*?)(?:["']{3})/m;

function extractDocstring(content: string, language: string): string {
  let m: RegExpMatchArray | null;

  switch (language) {
    case "typescript":
    case "javascript":
    case "tsx":
    case "jsx":
    case "java":
    case "kotlin":
      m = content.match(JSDOC_RE);
      break;
    case "python":
      m = content.match(PY_DOCSTRING_RE);
      break;
    default:
      return "";
  }

  if (!m) return "";
  return (
    m[1]
      ?.replace(/\s*\*\s*/g, " ")
      .trim()
      .slice(0, 200) ?? ""
  );
}

// ── Section extraction ────────────────────────────────────────────────────────

const SECTION_SINGLE_RE = /^(?:\/\/|#)\s*[-=]{3,}\s*(.+?)\s*[-=]{3,}\s*$/gm;
const SECTION_BLOCK_RE = /^\/\*\s*[-=]{3,}\s*(.+?)\s*[-=]{3,}\s*\*\/$/gm;

function extractSections(content: string): string[] {
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

// ── Internals extraction ──────────────────────────────────────────────────────

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

function extractInternals(content: string, exports: string[]): string[] {
  const exportSet = new Set(exports);
  const seen = new Set<string>();
  const results: string[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trimStart();
    // Skip comment lines and export lines
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

// ── Public interface ──────────────────────────────────────────────────────────

export interface FileMetadata {
  path: string;
  language: string | null;
  exports: string[];
  imports: string[];
  docstring: string;
  sections: string[];
  internals: string[];
}

// Synchronous — internal helper, not wrapped in lensFn
export function extractFileMetadata(content: string, path: string, language: string | null): FileMetadata {
  const lang = language ?? "text";
  const exports = extractExports(content, lang);
  return {
    path,
    language,
    exports,
    imports: extractImports(content, lang),
    docstring: extractDocstring(content, lang),
    sections: extractSections(content),
    internals: extractInternals(content, exports),
  };
}

// Synchronous — called from runIndex which is already lensFn-wrapped
export function extractAndPersistMetadata(db: Db, repoId: string): number {
  const rows = chunkQueries.getAllByRepo(db, repoId);

  // Merge chunks per file path
  const files = new Map<string, { content: string; language: string | null }>();
  for (const row of rows) {
    const existing = files.get(row.path);
    if (existing) {
      existing.content += `\n${row.content}`;
    } else {
      files.set(row.path, {
        content: row.content,
        language: row.language ?? detectLanguage(row.path),
      });
    }
  }

  let count = 0;
  for (const [path, { content, language }] of files) {
    const meta = extractFileMetadata(content, path, language);
    metadataQueries.upsert(db, repoId, path, {
      language: meta.language,
      exports: meta.exports,
      imports: meta.imports,
      docstring: meta.docstring,
      sections: meta.sections,
      internals: meta.internals,
    });
    count++;
  }

  return count;
}
