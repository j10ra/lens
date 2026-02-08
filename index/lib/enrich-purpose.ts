import { db } from "../../repo/db";

const MAX_FILES_PER_RUN = 200;
const MODEL_ID = "onnx-community/Qwen2.5-Coder-0.5B-Instruct";

export const purposeModelState = {
  status: "not_loaded" as "not_loaded" | "downloading" | "ready" | "failed",
  progress: 0,
};

let pipelinePromise: Promise<any> | null = null;

function getGenerator() {
  if (!pipelinePromise) {
    purposeModelState.status = "downloading";
    purposeModelState.progress = 0;
    pipelinePromise = import("@huggingface/transformers")
      .then(({ pipeline }) =>
        pipeline("text-generation", MODEL_ID, {
          dtype: "q4",
          progress_callback: (data: any) => {
            if (data.status === "progress") {
              purposeModelState.progress = Math.round(data.progress ?? 0);
            }
          },
        }),
      )
      .then((gen) => {
        purposeModelState.status = "ready";
        return gen;
      })
      .catch((err) => {
        console.error("[RLM] Purpose model load failed:", err.message);
        purposeModelState.status = "failed";
        pipelinePromise = null;
        return null;
      });
  }
  return pipelinePromise;
}

export interface EnrichResult {
  enriched: number;
  skipped: number;
  duration_ms: number;
}

interface CandidateRow {
  path: string;
  language: string | null;
  exports: string | string[];
  first_chunk: string;
  chunk_hash: string;
}

export async function enrichPurpose(repoId: string): Promise<EnrichResult> {
  const start = Date.now();

  const candidates: CandidateRow[] = [];
  const cursor = db.query<CandidateRow>`
    SELECT fm.path, fm.language, fm.exports,
           c.content AS first_chunk, c.chunk_hash
    FROM file_metadata fm
    JOIN chunks c ON c.repo_id = fm.repo_id AND c.path = fm.path AND c.chunk_index = 0
    WHERE fm.repo_id = ${repoId}
      AND (fm.purpose = '' OR fm.purpose IS NULL
           OR fm.purpose_hash != c.chunk_hash)
    LIMIT ${MAX_FILES_PER_RUN}
  `;
  for await (const row of cursor) {
    candidates.push(row);
  }

  if (candidates.length === 0) {
    return { enriched: 0, skipped: 0, duration_ms: Date.now() - start };
  }

  const generator = await getGenerator();
  if (!generator) {
    return { enriched: 0, skipped: candidates.length, duration_ms: Date.now() - start };
  }

  let enriched = 0;
  let skipped = 0;

  try {
    for (const row of candidates) {
      try {
        const messages = [
          {
            role: "system",
            content:
              "Describe what this code file does in one sentence. Be specific about its responsibilities.",
          },
          { role: "user", content: `File: ${row.path}\n\n${row.first_chunk}` },
        ];

        const result = await generator(messages, { max_new_tokens: 80 });
        const text: string = result[0]?.generated_text?.at(-1)?.content ?? "";
        const purpose = text.trim().slice(0, 500);

        if (purpose) {
          await db.exec`
            UPDATE file_metadata
            SET purpose = ${purpose}, purpose_hash = ${row.chunk_hash}
            WHERE repo_id = ${repoId} AND path = ${row.path}
          `;
          enriched++;
        } else {
          // Mark as attempted so we don't retry endlessly
          await db.exec`
            UPDATE file_metadata
            SET purpose_hash = ${row.chunk_hash}
            WHERE repo_id = ${repoId} AND path = ${row.path}
          `;
          skipped++;
        }

        if (enriched % 50 === 0 && enriched > 0) {
          console.log(
            `[RLM] Purpose: ${enriched} enriched (${candidates.length - enriched - skipped} remaining)`,
          );
        }
      } catch (err) {
        console.error(`[RLM] Purpose generation failed for ${row.path}:`, (err as Error).message);
        skipped++;
      }
    }
  } finally {
    try {
      await generator.dispose();
      pipelinePromise = null;
      purposeModelState.status = "not_loaded";
    } catch { /* ignore dispose errors */ }
  }

  return { enriched, skipped, duration_ms: Date.now() - start };
}
