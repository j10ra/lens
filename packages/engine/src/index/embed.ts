import type { Db } from "../db/connection";
import type { Capabilities } from "../capabilities";
import type { EmbedResult } from "../types";
import { chunkQueries } from "../db/queries";

const MAX_BATCHES_PER_CALL = 2000;
const EMBEDDING_BATCH_SIZE = 32;

export async function ensureEmbedded(db: Db, repoId: string, caps?: Capabilities): Promise<EmbedResult> {
  const start = Date.now();
  if (!caps?.embedTexts) {
    return { embedded_count: 0, skipped_count: 0, duration_ms: 0 };
  }

  let embedded = 0;
  let batchCount = 0;

  while (batchCount < MAX_BATCHES_PER_CALL) {
    const remaining = chunkQueries.countUnembedded(db, repoId);
    if (remaining === 0) break;

    const rows = chunkQueries.getUnembedded(db, repoId, EMBEDDING_BATCH_SIZE);
    if (rows.length === 0) break;

    const validRows = rows.filter((r) => r.content.trim().length > 0);
    if (validRows.length === 0) {
      batchCount++;
      continue;
    }

    try {
      const texts = validRows.map((r) => r.content);
      const vectors = await caps.embedTexts(texts);

      for (let i = 0; i < validRows.length; i++) {
        chunkQueries.updateEmbedding(db, validRows[i].id, repoId, vectors[i]);
      }

      embedded += validRows.length;
    } catch (err) {
      console.error(`[LENS] Embed batch failed:`, (err as Error).message);
      break;
    }
    batchCount++;
  }

  return { embedded_count: embedded, skipped_count: 0, duration_ms: Date.now() - start };
}
