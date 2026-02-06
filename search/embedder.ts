import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { EMBEDDING_MODEL, EMBEDDING_DIM, EMBEDDING_BATCH_SIZE } from "./config";

let extractor: FeatureExtractionPipeline | null = null;

/** Lazy-init the local embedding model (downloads on first use) */
async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", EMBEDDING_MODEL, {
      dtype: "q8" as never, // quantized for speed
    }) as unknown as FeatureExtractionPipeline;
  }
  return extractor;
}

/** Embed texts using local BGE model.
 *  Prefixes with "passage: " for documents, "query: " for queries. */
export async function embed(texts: string[], isQuery = false): Promise<number[][]> {
  const ext = await getExtractor();
  const prefix = isQuery ? "query: " : "passage: ";
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE).map((t) => prefix + t);
    const output = await ext(batch, { pooling: "mean", normalize: true });

    // output.tolist() returns number[][] for batch
    const vectors = output.tolist() as number[][];

    for (const vec of vectors) {
      if (vec.length !== EMBEDDING_DIM) {
        throw new Error(`Dimension mismatch: expected ${EMBEDDING_DIM}, got ${vec.length}`);
      }
      results.push(vec);
    }
  }

  return results;
}

/** Embed a single query string (uses "query: " prefix) */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embed([text], true);
  return vec;
}
