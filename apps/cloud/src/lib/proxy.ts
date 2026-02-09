const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function proxyVoyage(
  apiKey: string,
  body: unknown,
): Promise<Response> {
  return fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

export async function proxyOpenRouter(
  apiKey: string,
  body: unknown,
): Promise<Response> {
  return fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://lens.dev",
      "X-Title": "LENS",
    },
    body: JSON.stringify(body),
  });
}
