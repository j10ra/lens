import type { LanguageParser } from "../types.js";
import { extractCsharpImports } from "./imports.js";
import { extractCsharpNamespaces } from "./namespaces.js";
import { extractCsharpSymbols } from "./symbols.js";

export const csharpParser: LanguageParser = {
  languages: ["csharp"],

  extractImports(content) {
    return extractCsharpImports(content);
  },

  extractExports(content) {
    return extractCsharpSymbols(content)
      .filter((s) => s.exported)
      .map((s) => s.name);
  },

  extractDocstring(content) {
    const lines = content.split(/\r?\n/);
    const collected: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("///")) {
        collected.push(trimmed.replace(/^\/+/, "").trim());
        continue;
      }
      if (collected.length > 0) break;
      if (trimmed === "" || trimmed.startsWith("using ")) continue;
      break;
    }
    return collected
      .join(" ")
      .replace(/<\/?[a-zA-Z][^>]*>/g, "")
      .trim();
  },

  extractSections(content) {
    const out: string[] = [];
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*#region\s+(.+)$/);
      if (m) out.push(m[1].trim());
    }
    return out;
  },

  extractInternals(content, exports) {
    const exportSet = new Set(exports);
    return extractCsharpSymbols(content)
      .filter((s) => !s.exported && !exportSet.has(s.name))
      .map((s) => s.name);
  },

  extractSymbols(content) {
    return extractCsharpSymbols(content);
  },

  extractNamespaces(content) {
    return extractCsharpNamespaces(content);
  },

  resolveImport() {
    return null;
  },
};
