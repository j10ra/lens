import { extractSections, extractUniversalInternals } from "../common/patterns.js";
import type { LanguageParser } from "../types.js";
import { extractExports } from "./exports.js";
import { extractImports } from "./imports.js";
import { resolveImport } from "./resolve.js";
import { extractSymbols } from "./symbols.js";

const JSDOC_RE = /^\/\*\*\s*([\s\S]*?)\*\//m;

function extractDocstring(content: string): string {
  const m = content.match(JSDOC_RE);
  if (!m) return "";
  return (
    m[1]
      ?.replace(/\s*\*\s*/g, " ")
      .trim()
      .slice(0, 200) ?? ""
  );
}

export const typescriptParser: LanguageParser = {
  languages: ["typescript", "javascript", "tsx", "jsx"],
  extractImports,
  extractExports,
  extractDocstring,
  extractSections,
  extractInternals: extractUniversalInternals,
  extractSymbols,
  resolveImport,
};
