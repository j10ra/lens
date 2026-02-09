import { db } from "../../repo/db";
import { extractImportSpecifiers } from "./imports";
import { detectLanguage } from "./discovery";

// --- Export extraction regexes ---

const TS_EXPORT_RE = /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|enum|namespace)\s+(\w+)/gm;
const PY_EXPORT_RE = /^(?:def|class)\s+(\w+)/gm;
const GO_EXPORT_RE = /^func\s+([A-Z]\w*)/gm;
const RUST_EXPORT_RE = /^pub\s+(?:fn|struct|enum|trait|type|mod)\s+(\w+)/gm;
const CSHARP_EXPORT_RE = /^(?:public|internal)\s+(?:static\s+)?(?:abstract\s+|sealed\s+|partial\s+)?(?:class|interface|enum|struct|record|delegate)\s+(\w+)/gm;
const JAVA_EXPORT_RE = /^(?:public)\s+(?:static\s+)?(?:abstract\s+|final\s+)?(?:class|interface|enum|record)\s+(\w+)/gm;

// --- Docstring extraction regexes ---

const JSDOC_RE = /^\/\*\*\s*([\s\S]*?)\*\//m;
const PY_DOCSTRING_RE = /^(?:["']{3})([\s\S]*?)(?:["']{3})/m;
const CSHARP_DOC_RE = /^(?:\s*\/\/\/\s*(.*))+/m;
const GO_PKG_RE = /^\/\/\s*Package\s+\w+\s+(.*)/m;

function extractExports(content: string, language: string): string[] {
  const exports: string[] = [];
  let re: RegExp;

  switch (language) {
    case "typescript": case "javascript": case "tsx": case "jsx":
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
    case "java": case "kotlin":
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
    case "typescript": case "javascript": case "tsx": case "jsx":
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
  return m[1]?.replace(/\s*\*\s*/g, " ").trim().slice(0, 200) ?? "";
}

export interface FileMetadata {
  path: string;
  language: string;
  exports: string[];
  imports: string[];
  docstring: string;
}

export function extractFileMetadata(path: string, content: string, language: string): FileMetadata {
  return {
    path,
    language,
    exports: extractExports(content, language),
    imports: extractImportSpecifiers(content, language),
    docstring: extractDocstring(content, language),
  };
}

/** Extract + persist metadata for all indexed files in a repo */
export async function extractAndPersistMetadata(repoId: string): Promise<number> {
  const rows = db.query<{ path: string; content: string; language: string | null; chunk_index: number }>`
    SELECT path, content, language, chunk_index FROM chunks
    WHERE repo_id = ${repoId}
    ORDER BY path, chunk_index
  `;

  // Reassemble file content from chunks
  const files = new Map<string, { content: string; language: string }>();
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

  let count = 0;
  for (const [path, { content, language }] of files) {
    const meta = extractFileMetadata(path, content, language);
    await db.exec`
      INSERT INTO file_metadata (repo_id, path, language, exports, imports, docstring, updated_at)
      VALUES (${repoId}, ${path}, ${language}, ${JSON.stringify(meta.exports)}::jsonb,
              ${JSON.stringify(meta.imports)}::jsonb, ${meta.docstring}, now())
      ON CONFLICT (repo_id, path) DO UPDATE
        SET language = EXCLUDED.language,
            exports = EXCLUDED.exports,
            imports = EXCLUDED.imports,
            docstring = EXCLUDED.docstring,
            updated_at = now()
    `;
    count++;
  }

  return count;
}
