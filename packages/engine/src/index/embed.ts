import type { Capabilities } from "../capabilities";
import type { Db } from "../db/connection";
import { chunkQueries } from "../db/queries";
import type { EmbedResult } from "../types";

const MAX_API_CALLS = 2000;
const POOL_SIZE = 32;
const MAX_BATCH_TOKENS = 100_000; // Voyage limit 120k, 100k for safety
const CHARS_PER_TOKEN = 3; // Conservative estimate for code

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export async function ensureEmbedded(db: Db, repoId: string, caps?: Capabilities): Promise<EmbedResult> {
  const start = Date.now();
  if (!caps?.embedTexts) {
    return { embedded_count: 0, skipped_count: 0, duration_ms: 0 };
  }

  let embedded = 0;
  let apiCalls = 0;

  while (apiCalls < MAX_API_CALLS) {
    const remaining = chunkQueries.countUnembedded(db, repoId);
    if (remaining === 0) break;

    const rows = chunkQueries.getUnembedded(db, repoId, POOL_SIZE);
    if (rows.length === 0) break;

    const validRows = rows.filter((r) => r.content.trim().length > 0);
    if (validRows.length === 0) {
      apiCalls++;
      continue;
    }

    // Split pool into token-safe batches
    let offset = 0;
    let poolFailed = false;

    while (offset < validRows.length && apiCalls < MAX_API_CALLS) {
      const batch: typeof validRows = [];
      let batchTokens = 0;

      while (offset < validRows.length) {
        const est = estimateTokens(validRows[offset].content);
        if (batch.length > 0 && batchTokens + est > MAX_BATCH_TOKENS) break;
        batch.push(validRows[offset]);
        batchTokens += est;
        offset++;
      }

      try {
        const texts = batch.map((r) => r.content);
        const vectors = await caps.embedTexts(texts);

        for (let i = 0; i < batch.length; i++) {
          chunkQueries.updateEmbedding(db, batch[i].id, repoId, vectors[i]);
        }

        embedded += batch.length;
      } catch (err) {
        console.error(
          `[LENS] Embed batch failed (${batch.length} chunks, ~${batchTokens} tokens):`,
          (err as Error).message,
        );
        poolFailed = true;
        break;
      }
      apiCalls++;
    }

    if (poolFailed) break;
  }

  return { embedded_count: embedded, skipped_count: 0, duration_ms: Date.now() - start };
}
