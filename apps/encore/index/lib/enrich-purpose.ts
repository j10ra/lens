import { db } from "../../repo/db";
import { OPENROUTER_API_URL, PURPOSE_MODEL, PURPOSE_BATCH_LIMIT, PURPOSE_CONCURRENCY, OpenRouterApiKey } from "./models";

export const purposeModelState = {
  status: "ready" as "ready" | "failed",
};

export interface EnrichResult {
  enriched: number;
  skipped: number;
  duration_ms: number;
}

interface CandidateRow {
  path: string;
  first_chunk: string;
  chunk_hash: string;
  exports: string[] | null;
  docstring: string | null;
}

async function generatePurpose(apiKey: string, path: string, content: string, exports: string[] | null, docstring: string | null): Promise<string> {
  // Build enriched context: exports + docstring + chunk 0
  let enriched = `File: ${path}\n`;
  const exportList = Array.isArray(exports) ? exports : (typeof exports === "string" ? JSON.parse(exports) : null);
  if (exportList?.length) enriched += `Exports: ${exportList.join(", ")}\n`;
  if (docstring) enriched += `Docstring: ${docstring}\n`;
  enriched += `\n${content}`;
  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: PURPOSE_MODEL,
      messages: [
        { role: "system", content: "Describe what this code file does in one sentence. Be specific about its responsibilities. Reply with only the sentence, no preamble." },
        { role: "user", content: enriched },
      ],
      max_tokens: 150,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body}`);
  }

  const json = await res.json() as any;
  return (json.choices?.[0]?.message?.content ?? "").trim().slice(0, 500);
}

async function processBatch(
  apiKey: string,
  repoId: string,
  rows: CandidateRow[],
): Promise<{ enriched: number; skipped: number }> {
  let enriched = 0;
  let skipped = 0;

  const results = await Promise.allSettled(
    rows.map(async (row) => {
      const purpose = await generatePurpose(apiKey, row.path, row.first_chunk, row.exports, row.docstring);
      return { row, purpose };
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { row, purpose } = result.value;
      if (purpose) {
        await db.exec`
          UPDATE file_metadata
          SET purpose = ${purpose}, purpose_hash = ${row.chunk_hash}
          WHERE repo_id = ${repoId} AND path = ${row.path}
        `;
        enriched++;
      } else {
        await db.exec`
          UPDATE file_metadata SET purpose_hash = ${row.chunk_hash}
          WHERE repo_id = ${repoId} AND path = ${row.path}
        `;
        skipped++;
      }
    } else {
      // Log first failure per batch, mark purpose_hash to prevent infinite retry
      const row = rows[results.indexOf(result)];
      if (row && enriched === 0 && skipped === 0) {
        console.error(`[RLM] Purpose API error:`, result.reason);
      }
      if (row) {
        await db.exec`
          UPDATE file_metadata SET purpose_hash = ${row.chunk_hash}
          WHERE repo_id = ${repoId} AND path = ${row.path}
        `;
      }
      skipped++;
    }
  }

  return { enriched, skipped };
}

async function loadCandidates(repoId: string): Promise<CandidateRow[]> {
  const candidates: CandidateRow[] = [];
  const cursor = db.query<CandidateRow>`
    SELECT fm.path, fm.exports, fm.docstring, c.content AS first_chunk, c.chunk_hash
    FROM file_metadata fm
    JOIN chunks c ON c.repo_id = fm.repo_id AND c.path = fm.path AND c.chunk_index = 0
    WHERE fm.repo_id = ${repoId}
      AND fm.language IN ('typescript','javascript','python','ruby','go','rust',
                          'java','kotlin','csharp','cpp','c','swift','php','shell','sql')
      AND (fm.purpose = '' OR fm.purpose IS NULL
           OR fm.purpose_hash != c.chunk_hash)
    LIMIT ${PURPOSE_BATCH_LIMIT}
  `;
  for await (const row of cursor) {
    candidates.push(row);
  }
  return candidates;
}

/** Enrich file purpose summaries via OpenRouter.
 *  fullRun=true: loops until all files done (index/register).
 *  fullRun=false: single batch of 200 (cron). */
export async function enrichPurpose(repoId: string, fullRun = false): Promise<EnrichResult> {
  const start = Date.now();

  let apiKey: string;
  try {
    apiKey = OpenRouterApiKey();
  } catch (err) {
    console.error("[RLM] OpenRouterApiKey secret missing:", (err as Error).message);
    purposeModelState.status = "failed";
    return { enriched: 0, skipped: 0, duration_ms: 0 };
  }

  purposeModelState.status = "ready";

  let totalEnriched = 0;
  let totalSkipped = 0;

  while (true) {
    const candidates = await loadCandidates(repoId);
    if (candidates.length === 0) break;

    for (let i = 0; i < candidates.length; i += PURPOSE_CONCURRENCY) {
      const batch = candidates.slice(i, i + PURPOSE_CONCURRENCY);
      const { enriched, skipped } = await processBatch(apiKey, repoId, batch);
      totalEnriched += enriched;
      totalSkipped += skipped;
    }

    console.log(`[RLM] Purpose: ${totalEnriched} enriched, ${totalSkipped} skipped so far`);

    if (!fullRun) break;
  }

  console.log(`[RLM] Purpose complete: ${totalEnriched} enriched, ${totalSkipped} skipped in ${Date.now() - start}ms`);
  return { enriched: totalEnriched, skipped: totalSkipped, duration_ms: Date.now() - start };
}
