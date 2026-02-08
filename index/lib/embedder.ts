import { EMBEDDING_MODEL, EMBEDDING_DIM, EMBEDDING_BATCH_SIZE, VOYAGE_API_URL, VoyageApiKey } from "./models";

interface VoyageResponse {
  data: Array<{ embedding: number[] }>;
  usage: { total_tokens: number };
}

/** Embed texts via Voyage AI API.
 *  isQuery=true uses "query" input_type; false uses "document". */
export async function embed(texts: string[], isQuery = false): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const res = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VoyageApiKey()}`,
      },
      body: JSON.stringify({
        input: batch,
        model: EMBEDDING_MODEL,
        input_type: isQuery ? "query" : "document",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Voyage API ${res.status}: ${body}`);
    }

    const json = (await res.json()) as VoyageResponse;

    for (const item of json.data) {
      if (item.embedding.length !== EMBEDDING_DIM) {
        throw new Error(`Dimension mismatch: expected ${EMBEDDING_DIM}, got ${item.embedding.length}`);
      }
      results.push(item.embedding);
    }
  }

  return results;
}

/** Embed a single query string */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embed([text], true);
  return vec;
}
