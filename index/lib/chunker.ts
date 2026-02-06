import { createHash } from "node:crypto";

export interface ChunkingParams {
  target_lines: number;
  overlap_lines: number;
  version: number;
}

export const DEFAULT_CHUNKING_PARAMS: ChunkingParams = {
  target_lines: 150,
  overlap_lines: 10,
  version: 1,
};

export interface Chunk {
  chunk_index: number;
  start_line: number;
  end_line: number;
  content: string;
  chunk_hash: string;
}

/** Compute deterministic hash from content + params */
function computeChunkHash(content: string, params: ChunkingParams): string {
  const payload = JSON.stringify({ content, params });
  return createHash("sha256").update(payload).digest("hex");
}

/** Find the best split point near targetLine.
 *  Prefers blank lines, then function/class boundaries. */
function findBoundary(lines: string[], targetLine: number, windowSize = 15): number {
  const start = Math.max(0, targetLine - windowSize);
  const end = Math.min(lines.length, targetLine + windowSize);

  // Priority 1: blank line closest to target
  let bestBlank = -1;
  let bestBlankDist = Infinity;
  for (let i = start; i < end; i++) {
    if (lines[i].trim() === "") {
      const dist = Math.abs(i - targetLine);
      if (dist < bestBlankDist) {
        bestBlank = i;
        bestBlankDist = dist;
      }
    }
  }
  if (bestBlank >= 0) return bestBlank + 1; // split after blank line

  // Priority 2: function/class declaration
  const declPattern = /^(export\s+)?(function|class|interface|type|const|let|def|fn|pub|func)\s/;
  let bestDecl = -1;
  let bestDeclDist = Infinity;
  for (let i = start; i < end; i++) {
    if (declPattern.test(lines[i].trimStart())) {
      const dist = Math.abs(i - targetLine);
      if (dist < bestDeclDist) {
        bestDecl = i;
        bestDeclDist = dist;
      }
    }
  }
  if (bestDecl >= 0) return bestDecl; // split before declaration

  // Fallback: exact target
  return targetLine;
}

/** Split file content into boundary-aware chunks */
export function chunkFile(
  content: string,
  params: ChunkingParams = DEFAULT_CHUNKING_PARAMS,
): Chunk[] {
  const lines = content.split("\n");
  if (lines.length === 0) return [];

  // Small files: single chunk
  if (lines.length <= params.target_lines) {
    return [{
      chunk_index: 0,
      start_line: 1,
      end_line: lines.length,
      content,
      chunk_hash: computeChunkHash(content, params),
    }];
  }

  const chunks: Chunk[] = [];
  let pos = 0;

  while (pos < lines.length) {
    const rawEnd = Math.min(pos + params.target_lines, lines.length);

    let end: number;
    if (rawEnd >= lines.length) {
      end = lines.length;
    } else {
      end = findBoundary(lines, rawEnd);
      // Ensure we make forward progress
      if (end <= pos) end = rawEnd;
    }

    const chunkLines = lines.slice(pos, end);
    const chunkContent = chunkLines.join("\n");

    chunks.push({
      chunk_index: chunks.length,
      start_line: pos + 1,       // 1-based
      end_line: end,             // 1-based inclusive
      content: chunkContent,
      chunk_hash: computeChunkHash(chunkContent, params),
    });

    // Advance with overlap
    pos = Math.max(pos + 1, end - params.overlap_lines);
  }

  return chunks;
}
