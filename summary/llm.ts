import { secret } from "encore.dev/config";

const zaiApiKey = secret("ZaiApiKey");

const API_URL = "https://api.z.ai/api/paas/v4/chat/completions";
const MODEL = "glm-4.7";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
}

export async function chat(
  messages: ChatMessage[],
  maxTokens = 1024,
): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${zaiApiKey()}`,
    },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as ChatResponse;
  return data.choices?.[0]?.message?.content ?? "";
}
