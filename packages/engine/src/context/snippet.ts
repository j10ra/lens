import type { Db } from "../db/connection";
import { chunkQueries } from "../db/queries";
import type { FileMetadataRow, ParsedQuery, ResolvedSnippet } from "../types";

const SYMBOL_DEF_RE =
  /^.*?\b(?:function|def|fn|class|const|let|var|type|interface|struct|enum|export\s+(?:function|class|const|type|interface|default))\s+/;

function findSymbolLine(symbol: string, chunkRows: Array<{ start_line: number; content: string }>): number | null {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`);
  for (const chunk of chunkRows) {
    const lines = chunk.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i]) && SYMBOL_DEF_RE.test(lines[i])) {
        return chunk.start_line + i;
      }
    }
  }
  // Fallback: any line containing the symbol
  for (const chunk of chunkRows) {
    const lines = chunk.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        return chunk.start_line + i;
      }
    }
  }
  return null;
}

function pickBestExport(exports: string[], queryTokens: string[]): string {
  if (exports.length <= 1 || !queryTokens.length) return exports[0];
  let best = exports[0];
  let bestScore = 0;
  for (const exp of exports) {
    const lower = exp.toLowerCase();
    // Decompose camelCase into tokens
    const expTokens = lower.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[\s_-]+/);
    let score = 0;
    for (const qt of queryTokens) {
      if (lower.includes(qt)) score += 2;
      else if (expTokens.some((t) => t.includes(qt) || qt.includes(t))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = exp;
    }
  }
  return best;
}

export function resolveSnippets(
  db: Db,
  repoId: string,
  files: Array<{ path: string; reason: string }>,
  metadata: FileMetadataRow[],
  parsed: ParsedQuery,
  limit = 5,
): Map<string, ResolvedSnippet> {
  const result = new Map<string, ResolvedSnippet>();
  const topFiles = files.slice(0, limit);
  const topPaths = topFiles.map((f) => f.path);

  // Load chunks for top files (1 bounded query)
  const allChunks = chunkQueries.getByRepoPaths(db, repoId, topPaths);
  const chunksByPath = new Map<string, Array<{ start_line: number; content: string }>>();
  for (const c of allChunks) {
    const arr = chunksByPath.get(c.path) ?? [];
    arr.push({ start_line: c.start_line, content: c.content });
    chunksByPath.set(c.path, arr);
  }

  const metaMap = new Map<string, FileMetadataRow>();
  for (const m of metadata) metaMap.set(m.path, m);

  // Frame index for stack_trace queries
  const frameByPath = new Map<string, number>();
  for (const frame of parsed.frames) {
    // Match frame paths to file paths (suffix match)
    for (const p of topPaths) {
      if (p.endsWith(frame.path) || frame.path.endsWith(p)) {
        frameByPath.set(p, frame.line);
      }
    }
  }

  for (const f of topFiles) {
    const chunks = chunksByPath.get(f.path) ?? [];
    const meta = metaMap.get(f.path);

    // 1. Stack frame match
    const frameLine = frameByPath.get(f.path);
    if (frameLine !== undefined) {
      result.set(f.path, { path: f.path, symbol: null, line: frameLine, matchKind: "frame" });
      continue;
    }

    // 2. Symbol match from parsed query
    if (parsed.symbol) {
      const exports = meta?.exports ?? [];
      const internals = meta?.internals ?? [];
      if (exports.includes(parsed.symbol)) {
        const line = findSymbolLine(parsed.symbol, chunks);
        result.set(f.path, { path: f.path, symbol: parsed.symbol, line, matchKind: "export" });
        continue;
      }
      if (internals.includes(parsed.symbol)) {
        const line = findSymbolLine(parsed.symbol, chunks);
        result.set(f.path, { path: f.path, symbol: parsed.symbol, line, matchKind: "internal" });
        continue;
      }
    }

    // 3. Best export matching query tokens
    if (meta?.exports?.length) {
      const bestExport = pickBestExport(meta.exports, parsed.naturalTokens);
      const line = findSymbolLine(bestExport, chunks);
      result.set(f.path, { path: f.path, symbol: bestExport, line, matchKind: "export" });
      continue;
    }

    // 4. Fallback
    result.set(f.path, { path: f.path, symbol: null, line: null, matchKind: null });
  }

  return result;
}
