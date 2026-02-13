import type { Capabilities } from "../capabilities";
import type { Db } from "../db/connection";
import { chunkQueries } from "../db/queries";
import { isDocFile } from "../index/discovery";
import type { VectorResult } from "../types";

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

export async function vectorSearch(
  db: Db,
  repoId: string,
  query: string,
  limit: number,
  caps?: Capabilities,
  codeOnly = true,
): Promise<VectorResult[]> {
  if (!caps?.embedTexts) return [];
  if (!chunkQueries.hasEmbeddings(db, repoId)) return [];

  const [queryVec] = await caps.embedTexts([query], true);
  const queryArr = new Float32Array(queryVec);

  const allChunks = chunkQueries.getAllEmbedded(db, repoId);

  const scored = allChunks
    .map((c) => ({
      id: c.id,
      path: c.path,
      start_line: c.start_line,
      end_line: c.end_line,
      content: c.content,
      language: c.language,
      score: cosine(queryArr, c.embedding),
    }))
    .filter((c) => !codeOnly || !isDocFile(c.path))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}
