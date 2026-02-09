import type { Db } from "../db/connection";
import { chunkQueries, metadataQueries } from "../db/queries";
import { extractImportSpecifiers } from "./imports";
import { detectLanguage } from "./discovery";

const TS_EXPORT_RE =
  /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|enum|namespace)\s+(\w+)/gm;
const PY_EXPORT_RE = /^(?:def|class)\s+(\w+)/gm;
const GO_EXPORT_RE = /^func\s+([A-Z]\w*)/gm;
const RUST_EXPORT_RE = /^pub\s+(?:fn|struct|enum|trait|type|mod)\s+(\w+)/gm;
const CSHARP_EXPORT_RE =
  /^(?:public|internal)\s+(?:static\s+)?(?:abstract\s+|sealed\s+|partial\s+)?(?:class|interface|enum|struct|record|delegate)\s+(\w+)/gm;
const JAVA_EXPORT_RE = /^(?:public)\s+(?:static\s+)?(?:abstract\s+|final\s+)?(?:class|interface|enum|record)\s+(\w+)/gm;

const JSDOC_RE = /^\/\*\*\s*([\s\S]*?)\*\//m;
const PY_DOCSTRING_RE = /^(?:["']{3})([\s\S]*?)(?:["']{3})/m;
const CSHARP_DOC_RE = /^(?:\s*\/\/\/\s*(.*))+/m;
const GO_PKG_RE = /^\/\/\s*Package\s+\w+\s+(.*)/m;

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
    case "csharp":
      re = new RegExp(CSHARP_EXPORT_RE.source, "gm");
      break;
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
}

export function extractFileMetadata(path: string, content: string, language: string): FileMetadataExtracted {
  return {
    path,
    language,
    exports: extractExports(content, language),
    imports: extractImportSpecifiers(content, language),
    docstring: extractDocstring(content, language),
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
    metadataQueries.upsert(db, repoId, path, language, meta.exports, meta.imports, meta.docstring);
    count++;
  }

  return count;
}
