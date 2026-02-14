import type { Db } from "../db/connection";
import { chunkQueries } from "../db/queries";
import type { CodeSlice, QueryKind, ResolvedSnippet } from "../types";

const RADIUS = 10;

const MAX_SLICES: Record<QueryKind, number> = {
  symbol: 1,
  error_message: 1,
  stack_trace: 2,
  natural: 3,
};

function extractSlice(
  chunks: Array<{ start_line: number; end_line: number; content: string }>,
  targetLine: number,
): { startLine: number; endLine: number; code: string } | null {
  const chunk = chunks.find((c) => c.start_line <= targetLine && targetLine <= c.end_line);
  if (!chunk) return null;

  const lines = chunk.content.split("\n");
  const offset = targetLine - chunk.start_line;
  const from = Math.max(0, offset - RADIUS);
  const to = Math.min(lines.length, offset + RADIUS + 1);
  const sliced = lines.slice(from, to);

  if (!sliced.length) return null;

  return {
    startLine: chunk.start_line + from,
    endLine: chunk.start_line + to - 1,
    code: sliced.join("\n"),
  };
}

export function sliceContext(
  db: Db,
  repoId: string,
  snippets: Map<string, ResolvedSnippet>,
  queryKind: QueryKind,
): Map<string, CodeSlice> {
  const result = new Map<string, CodeSlice>();
  const limit = MAX_SLICES[queryKind] ?? 3;

  const candidates = [...snippets.values()].filter((s) => s.line !== null).slice(0, limit);
  if (!candidates.length) return result;

  const paths = candidates.map((c) => c.path);
  const allChunks = chunkQueries.getByRepoPaths(db, repoId, paths);

  const chunksByPath = new Map<string, Array<{ start_line: number; end_line: number; content: string }>>();
  for (const c of allChunks) {
    const arr = chunksByPath.get(c.path) ?? [];
    arr.push({ start_line: c.start_line, end_line: c.end_line, content: c.content });
    chunksByPath.set(c.path, arr);
  }

  for (const snip of candidates) {
    const chunks = chunksByPath.get(snip.path);
    if (!chunks) continue;

    const slice = extractSlice(chunks, snip.line!);
    if (!slice) continue;

    result.set(snip.path, {
      path: snip.path,
      startLine: slice.startLine,
      endLine: slice.endLine,
      code: slice.code,
      symbol: snip.symbol,
    });
  }

  return result;
}
