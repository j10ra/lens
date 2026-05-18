import { parse } from "@ast-grep/napi";

export type SupportedLanguage = "typescript" | "tsx" | "javascript";

export interface PatternFile {
  path: string;
  content: string;
}

export interface PatternMatch {
  path: string;
  line: number;
  column: number;
  text: string;
  captures: Record<string, string>;
}

export interface PatternResult {
  pattern: string;
  language: SupportedLanguage;
  matches: PatternMatch[];
  truncated: boolean;
  filesScanned: number;
}

export interface RunPatternArgs {
  pattern: string;
  language: SupportedLanguage;
  files: PatternFile[];
  limit: number;
}

// Maps our SupportedLanguage to the string values @ast-grep/napi 0.42.2 accepts.
// Lang enum is empty at runtime; the underlying native binding accepts these exact strings.
const LANG_MAP: Record<SupportedLanguage, string> = {
  typescript: "TypeScript",
  tsx: "Tsx",
  javascript: "JavaScript",
};

// Extract bare meta-variable names from a pattern string.
// Handles $NAME and $$$NAME; skips $$$ (ellipsis-only).
function extractMetaVars(pattern: string): string[] {
  const names = new Set<string>();
  for (const m of pattern.matchAll(/\$+([A-Z_][A-Z0-9_]*)/g)) {
    names.add(m[1]);
  }
  return [...names];
}

export async function runPatternImpl(args: RunPatternArgs): Promise<PatternResult> {
  const { pattern, language, files, limit } = args;
  const lang = LANG_MAP[language];
  if (!lang) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const metaVars = extractMetaVars(pattern);
  const matches: PatternMatch[] = [];
  let truncated = false;

  for (const file of files) {
    if (matches.length >= limit) {
      truncated = true;
      break;
    }
    const root = parse(lang, file.content).root();
    const found = root.findAll(pattern);
    for (const node of found) {
      if (matches.length >= limit) {
        truncated = true;
        break;
      }
      const range = node.range();
      const captures: Record<string, string> = {};
      for (const name of metaVars) {
        const captured = node.getMatch(name);
        if (captured) captures[name] = captured.text();
      }
      matches.push({
        path: file.path,
        line: range.start.line + 1,
        column: range.start.column + 1,
        text: node.text(),
        captures,
      });
    }
  }

  return {
    pattern,
    language,
    matches,
    truncated,
    filesScanned: files.length,
  };
}
