import type { Capabilities } from "../capabilities";
import type { Db } from "../db/connection";
import { jsonParse, metadataQueries } from "../db/queries";
import type { EnrichResult } from "../types";

const PURPOSE_BATCH_LIMIT = 200;
const PURPOSE_CONCURRENCY = 10;

export async function enrichPurpose(
  db: Db,
  repoId: string,
  caps?: Capabilities,
  fullRun = false,
): Promise<EnrichResult> {
  const start = Date.now();
  if (!caps?.generatePurpose) {
    return { enriched: 0, skipped: 0, duration_ms: 0 };
  }

  let totalEnriched = 0;
  let totalSkipped = 0;

  while (true) {
    const candidates = metadataQueries.getCandidatesForPurpose(db, repoId, PURPOSE_BATCH_LIMIT);
    if (candidates.length === 0) break;

    for (let i = 0; i < candidates.length; i += PURPOSE_CONCURRENCY) {
      const batch = candidates.slice(i, i + PURPOSE_CONCURRENCY);

      const results = await Promise.allSettled(
        batch.map(async (row) => {
          const exports = Array.isArray(row.exports) ? row.exports : jsonParse(row.exports, [] as string[]);
          const purpose = await caps.generatePurpose!(row.path, row.first_chunk, exports, row.docstring ?? "");
          return { row, purpose };
        }),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const row = batch[j];
        if (result.status === "fulfilled" && result.value.purpose) {
          metadataQueries.updatePurpose(db, repoId, row.path, result.value.purpose, row.chunk_hash);
          totalEnriched++;
        } else {
          metadataQueries.setPurposeHash(db, repoId, row.path, row.chunk_hash);
          totalSkipped++;
        }
      }
    }

    if (!fullRun) break;
  }

  return { enriched: totalEnriched, skipped: totalSkipped, duration_ms: Date.now() - start };
}
