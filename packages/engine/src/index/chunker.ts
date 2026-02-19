import { createHash } from "node:crypto";

const CHUNK_SIZE = 150;
const OVERLAP = 20;

export interface Chunk {
  chunkIndex: number;
  startLine: number;
  endLine: number;
  content: string;
  chunkHash: string;
}

function computeChunkHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function findBoundary(lines: string[], targetLine: number, windowSize = 15): number {
  const start = Math.max(0, targetLine - windowSize);
  const end = Math.min(lines.length, targetLine + windowSize);

  // Prefer blank lines as boundaries (cleanest chunk split)
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
  if (bestBlank >= 0) return bestBlank + 1;

  // Fall back to declaration boundaries
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
  if (bestDecl >= 0) return bestDecl;

  return targetLine;
}

// Synchronous — not wrapped in lensFn (internal helper, called in tight loops)
export function chunkFile(content: string, _path?: string): Chunk[] {
  const lines = content.split("\n");
  if (lines.length === 0) return [];

  if (lines.length <= CHUNK_SIZE) {
    return [
      {
        chunkIndex: 0,
        startLine: 1,
        endLine: lines.length,
        content,
        chunkHash: computeChunkHash(content),
      },
    ];
  }

  const result: Chunk[] = [];
  let pos = 0;

  while (pos < lines.length) {
    const rawEnd = Math.min(pos + CHUNK_SIZE, lines.length);

    let end: number;
    if (rawEnd >= lines.length) {
      end = lines.length;
    } else {
      end = findBoundary(lines, rawEnd);
      if (end <= pos) end = rawEnd;
    }

    const chunkLines = lines.slice(pos, end);
    const chunkContent = chunkLines.join("\n");

    result.push({
      chunkIndex: result.length,
      startLine: pos + 1,
      endLine: end,
      content: chunkContent,
      chunkHash: computeChunkHash(chunkContent),
    });

    pos = Math.max(pos + 1, end - OVERLAP);
  }

  return result;
}
