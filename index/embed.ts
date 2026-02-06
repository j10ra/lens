import { db } from "../repo/db";
import { embed } from "../search/embedder";
import { EMBEDDING_BATCH_SIZE } from "../search/config";

export interface EmbedResult {
  embedded_count: number;
  skipped_count: number;
  duration_ms: number;
}

/** Lazy embedding: embed only chunks where embedding IS NULL.
 *  Called after ensureIndexed(). Failure is non-fatal — search degrades to grep. */
export async function ensureEmbedded(repoId: string): Promise<EmbedResult> {
  const start = Date.now();

  // Count unembedded chunks
  const countRow = await db.queryRow<{ count: number }>`
    SELECT count(*)::int AS count FROM chunks
    WHERE repo_id = ${repoId} AND embedding IS NULL
  `;
  const total = countRow?.count ?? 0;

  if (total === 0) {
    return { embedded_count: 0, skipped_count: 0, duration_ms: Date.now() - start };
  }

  let embedded = 0;

  // Process in batches
  while (embedded < total) {
    const rows: Array<{ id: string; content: string }> = [];
    const cursor = db.query<{ id: string; content: string }>`
      SELECT id, content FROM chunks
      WHERE repo_id = ${repoId} AND embedding IS NULL
      LIMIT ${EMBEDDING_BATCH_SIZE}
    `;
    for await (const row of cursor) {
      rows.push(row);
    }

    if (rows.length === 0) break;

    const texts = rows.map((r) => r.content);
    const vectors = await embed(texts);

    for (let i = 0; i < rows.length; i++) {
      const vecStr = `[${vectors[i].join(",")}]`;
      await db.exec`
        UPDATE chunks SET embedding = ${vecStr}::vector, updated_at = now()
        WHERE id = ${rows[i].id}
      `;
    }

    embedded += rows.length;
  }

  // Update index statistics after bulk embedding
  if (embedded > 100) {
    await db.exec`ANALYZE chunks`;
  }

  return {
    embedded_count: embedded,
    skipped_count: 0,
    duration_ms: Date.now() - start,
  };
}
