import type { ParsedQuery } from "../types";

const FRAME_PATTERNS = [
  // JS/TS: at fn (path:line:col) or at path:line:col
  /at\s+(?:\S+\s+\()?([^():]+):(\d+):\d+\)?/g,
  // Python: File "path", line N
  /File\s+"([^"]+)",\s+line\s+(\d+)/g,
  // C#/Java: at namespace(path:line)
  /at\s+\S+\(([^():]+):(\d+)\)/g,
];

const CASING_BOUNDARY = /[a-z][A-Z]|_/;
const SYMBOL_RE = /^[a-zA-Z_]\w+$/;
const ERROR_CODE_RE = /\b[A-Z][A-Z0-9_]{2,}\b/;
const ERROR_SUFFIX_RE = /\w+(Exception|Error)\b/;
const ERROR_PREFIX_RE = /\b(TypeError|ReferenceError|SyntaxError|RangeError|Error|panic|FATAL|WARN|ERR):/;

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "can",
  "need",
  "must",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "and",
  "but",
  "or",
  "not",
  "no",
  "so",
  "if",
  "then",
  "than",
  "that",
  "this",
  "it",
  "its",
  "all",
  "each",
  "every",
  "any",
  "some",
  "how",
  "what",
  "which",
  "who",
  "when",
  "where",
  "why",
  "get",
  "set",
  "new",
  "null",
  "true",
  "false",
  "void",
  "type",
  "var",
  "let",
  "const",
  "return",
  "import",
  "export",
  "default",
  "class",
  "function",
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "index",
  "data",
  "value",
  "result",
  "item",
  "list",
  "name",
  "id",
  "key",
  "src",
  "lib",
  "app",
  "spec",
  "mock",
  "module",
]);

function extractFrames(query: string): Array<{ path: string; line: number }> {
  const frames: Array<{ path: string; line: number }> = [];
  const seen = new Set<string>();
  for (const pattern of FRAME_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(query))) {
      const raw = m[1].replace(/^\.\//, "").replace(/^\/+/, "");
      const line = Number.parseInt(m[2], 10);
      const key = `${raw}:${line}`;
      if (!seen.has(key)) {
        seen.add(key);
        frames.push({ path: raw, line });
      }
    }
  }
  return frames;
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export function parseQuery(query: string): ParsedQuery {
  const naturalTokens = tokenize(query);
  // 1. Stack trace — 2+ frame matches
  const frames = extractFrames(query);
  if (frames.length >= 2) {
    return { kind: "stack_trace", raw: query, frames, symbol: null, errorToken: null, naturalTokens };
  }

  // 2. Symbol — single token with casing boundary
  const trimmed = query.trim();
  if (SYMBOL_RE.test(trimmed) && trimmed.length >= 4 && CASING_BOUNDARY.test(trimmed)) {
    return { kind: "symbol", raw: query, frames: [], symbol: trimmed, errorToken: null, naturalTokens };
  }

  // 3. Error message
  const errorCode = query.match(ERROR_CODE_RE)?.[0];
  const errorSuffix = query.match(ERROR_SUFFIX_RE)?.[0];
  const errorPrefix = query.match(ERROR_PREFIX_RE)?.[1];
  const errorToken = errorCode || errorSuffix || errorPrefix || null;
  if (errorToken) {
    // If there's also 1 frame, still treat as error but include the frame
    return { kind: "error_message", raw: query, frames, symbol: null, errorToken, naturalTokens };
  }

  // 4. Natural language fallback
  return { kind: "natural", raw: query, frames, symbol: null, errorToken: null, naturalTokens };
}
