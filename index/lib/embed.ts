import { db } from "../../repo/db";
import { embed } from "./embedder";
import { EMBEDDING_BATCH_SIZE } from "./search-config";

export interface EmbedResult {
  embedded_count: number;
  skipped_count: number;
  duration_ms: number;
}

const MAX_BATCHES_PER_CALL = 2000;

/** Lazy embedding: only code chunks where embedding IS NULL.
 *  Skips config/docs (json, yaml, md, html, css) — grep handles those. */
export async function ensureEmbedded(repoId: string): Promise<EmbedResult> {
  const start = Date.now();
  let embedded = 0;
  let batchCount = 0;

  while (batchCount < MAX_BATCHES_PER_CALL) {
    const countRow = await db.queryRow<{ count: number }>`
      SELECT count(*)::int AS count FROM chunks
      WHERE repo_id = ${repoId} AND embedding IS NULL
        AND language IN ('typescript','javascript','python','ruby','go','rust',
                         'java','kotlin','csharp','cpp','c','swift','php','shell')
    `;
    const remaining = countRow?.count ?? 0;
    if (remaining === 0) break;

    const rows: Array<{ id: string; content: string }> = [];
    const cursor = db.query<{ id: string; content: string }>`
      SELECT id, content FROM chunks
      WHERE repo_id = ${repoId} AND embedding IS NULL
        AND language IN ('typescript','javascript','python','ruby','go','rust',
                         'java','kotlin','csharp','cpp','c','swift','php','shell')
        AND content IS NOT NULL AND trim(content) != ''
      LIMIT ${EMBEDDING_BATCH_SIZE}
    `;
    for await (const row of cursor) {
      rows.push(row);
    }
    if (rows.length === 0) break;

    // Filter empty content (Voyage API rejects empty strings)
    const validRows = rows.filter((r) => r.content.trim().length > 0);
    if (validRows.length === 0) { batchCount++; continue; }

    try {
      const texts = validRows.map((r) => r.content);
      const vectors = await embed(texts);

      for (let i = 0; i < validRows.length; i++) {
        const vecStr = `[${vectors[i].join(",")}]`;
        await db.exec`
          UPDATE chunks SET embedding = ${vecStr}::vector, updated_at = now()
          WHERE id = ${validRows[i].id} AND repo_id = ${repoId}
        `;
      }

      embedded += validRows.length;
      if (embedded % 160 === 0) {
        console.log(`[RLM] Embedded ${embedded} chunks (${remaining - rows.length} remaining)`);
      }
    } catch (err) {
      console.error(`[RLM] Embed batch failed (batch ${batchCount}, ${embedded} embedded so far):`, (err as Error).message);
      break;
    }
    batchCount++;
  }

  if (embedded > 100) {
    await db.exec`ANALYZE chunks`;
  }

  return {
    embedded_count: embedded,
    skipped_count: 0,
    duration_ms: Date.now() - start,
  };
}
