import type { Db } from "../db/connection";
import { chunkQueries, metadataQueries } from "../db/queries";
import { detectLanguage } from "./discovery";
import { extractImportSpecifiers } from "./imports";

const TS_EXPORT_RE =
  /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|enum|namespace)\s+(\w+)/gm;
const PY_EXPORT_RE = /^(?:def|class)\s+(\w+)/gm;
const GO_EXPORT_RE = /^func\s+([A-Z]\w*)/gm;
const RUST_EXPORT_RE = /^pub\s+(?:fn|struct|enum|trait|type|mod)\s+(\w+)/gm;
const CSHARP_EXPORT_RE =
  /^\s*(?:public|internal)\s+(?:static\s+)?(?:abstract\s+|sealed\s+|partial\s+)?(?:class|interface|enum|struct|record|delegate)\s+(\w+)/gm;
const CSHARP_EXPORT_METHOD_RE =
  /^\s*public\s+(?:static\s+)?(?:async\s+)?(?:override\s+)?(?:virtual\s+)?[\w<>\[\]?.]+\s+(\w+)\s*\(/gm;
const JAVA_EXPORT_RE = /^\s*(?:public)\s+(?:static\s+)?(?:abstract\s+|final\s+)?(?:class|interface|enum|record)\s+(\w+)/gm;

const JSDOC_RE = /^\/\*\*\s*([\s\S]*?)\*\//m;
const PY_DOCSTRING_RE = /^(?:["']{3})([\s\S]*?)(?:["']{3})/m;
const CSHARP_DOC_RE = /^(?:\s*\/\/\/\s*(.*))+/m;
const GO_PKG_RE = /^\/\/\s*Package\s+\w+\s+(.*)/m;
const RUST_DOC_RE = /^(?:\s*\/\/!\s*(.*)(?:\n\s*\/\/!\s*(.*))*)/m;

function extractExports(content: string, language: string): string[] {
  const exports: string[] = [];
  let re: RegExp;

  switch (language) {
    case "typescript":
    case "javascript":
    case "tsx":
    case "jsx":
      re = new RegExp(TS_EXPORT_RE.source, "gm");
      break;
    case "python":
      re = new RegExp(PY_EXPORT_RE.source, "gm");
      break;
    case "go":
      re = new RegExp(GO_EXPORT_RE.source, "gm");
      break;
    case "rust":
      re = new RegExp(RUST_EXPORT_RE.source, "gm");
      break;
    case "csharp": {
      const exports: string[] = [];
      for (const pattern of [CSHARP_EXPORT_RE, CSHARP_EXPORT_METHOD_RE]) {
        for (const m of content.matchAll(new RegExp(pattern.source, "gm"))) {
          if (m[1] && !exports.includes(m[1])) exports.push(m[1]);
        }
      }
      return exports.slice(0, 30);
    }
    case "java":
    case "kotlin":
      re = new RegExp(JAVA_EXPORT_RE.source, "gm");
      break;
    default:
      return [];
  }

  for (const m of content.matchAll(re)) {
    if (m[1] && !exports.includes(m[1])) exports.push(m[1]);
  }

  return exports.slice(0, 30);
}

function extractDocstring(content: string, language: string): string {
  let m: RegExpMatchArray | null;

  switch (language) {
    case "typescript":
    case "javascript":
    case "tsx":
    case "jsx":
      m = content.match(JSDOC_RE);
      break;
    case "python":
      m = content.match(PY_DOCSTRING_RE);
      break;
    case "csharp":
      m = content.match(CSHARP_DOC_RE);
      break;
    case "go":
      m = content.match(GO_PKG_RE);
      break;
    case "rust": {
      const rustMatch = content.match(RUST_DOC_RE);
      if (!rustMatch) return "";
      return rustMatch[0]
        .replace(/^\s*\/\/!\s?/gm, "")
        .replace(/\n/g, " ")
        .trim()
        .slice(0, 200);
    }
    case "java":
    case "kotlin":
      m = content.match(JSDOC_RE);
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

export interface FileMetadataExtracted {
  path: string;
  language: string;
  exports: string[];
  imports: string[];
  docstring: string;
  sections: string[];
  internals: string[];
}

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

const UNIVERSAL_DECL_RES: RegExp[] = [
  /^\s*(?:async\s+|suspend\s+)?(?:function|def|fn|func|fun)\s+(?:\([^)]+\)\s+)?(\w+)/gm,
  /^\s*(?:const|let|var|val)\s+(\w+)\s*[=:]/gm,
  /^\s*(?:abstract\s+|sealed\s+|partial\s+|data\s+)?(?:class|struct|enum|trait|interface|record|object|mod)\s+(\w+)/gm,
  /^\s*type\s+(\w+)\s*[=<{]/gm,
  /^\s*(?:private|protected|internal)\s+(?:static\s+)?(?:async\s+)?(?:suspend\s+)?(?:override\s+)?[\w<>\[\]?.]+\s+(\w+)\s*\(/gm,
];

const EXPORT_LINE_RE = /^(?:export|pub\s|public\s)/;

function universalSkipLine(line: string): boolean {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return true;
  if (trimmed.startsWith("#") && !trimmed.startsWith("#!")) return true;
  return EXPORT_LINE_RE.test(trimmed);
}

const SKIP_NAMES = new Set([
  "if","for","foreach","while","switch","using","catch","lock",
  "return","throw","yield","try","do","else","new","await",
  "base","this","super","self","import","require","from","package",
]);

function universalSkipName(name: string): boolean {
  return SKIP_NAMES.has(name) || name.startsWith("_");
}

function collectMatches(
  content: string,
  regexes: RegExp[],
  exportSet: Set<string>,
  skipLine?: (line: string) => boolean,
  skipName?: (name: string) => boolean,
): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const line of content.split("\n")) {
    if (skipLine?.(line)) continue;
    for (const re of regexes) {
      const pattern = new RegExp(re.source, re.flags);
      for (const m of line.matchAll(pattern)) {
        const name = m[1];
        if (
          name &&
          name.length >= 6 &&
          !exportSet.has(name) &&
          !seen.has(name) &&
          !skipName?.(name)
        ) {
          seen.add(name);
          results.push(name);
        }
      }
    }
  }

  return results.slice(0, 20);
}

function extractInternals(content: string, _language: string, exports: string[]): string[] {
  return collectMatches(content, UNIVERSAL_DECL_RES, new Set(exports), universalSkipLine, universalSkipName);
}

export function extractFileMetadata(path: string, content: string, language: string): FileMetadataExtracted {
  const exports = extractExports(content, language);
  return {
    path,
    language,
    exports,
    imports: extractImportSpecifiers(content, language),
    docstring: extractDocstring(content, language),
    sections: extractSections(content),
    internals: extractInternals(content, language, exports),
  };
}

export function extractAndPersistMetadata(db: Db, repoId: string): number {
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

  let count = 0;
  for (const [path, { content, language }] of files) {
    const meta = extractFileMetadata(path, content, language);
    metadataQueries.upsert(
      db,
      repoId,
      path,
      language,
      meta.exports,
      meta.imports,
      meta.docstring,
      meta.sections,
      meta.internals,
    );
    count++;
  }

  return count;
}
