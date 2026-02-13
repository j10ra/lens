import type { Capabilities } from "@lens/engine";
import { getCloudUrl } from "./config";

export type UsageTracker = (counter: string, amount?: number) => void;
export type RequestLogger = (
  method: string,
  path: string,
  status: number,
  durationMs: number,
  source: string,
  requestBody?: string,
  responseBody?: string,
) => void;

export function createCloudCapabilities(
  apiKey: string,
  trackUsage?: UsageTracker,
  logRequest?: RequestLogger,
): Capabilities {
  const CLOUD_API_URL = getCloudUrl();
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  return {
    async embedTexts(texts: string[], isQuery?: boolean): Promise<number[][]> {
      const start = performance.now();
      const reqBody = JSON.stringify({
        input: texts,
        model: "voyage-code-3",
        input_type: isQuery ? "query" : "document",
      });
      const res = await fetch(`${CLOUD_API_URL}/api/proxy/embed`, {
        method: "POST",
        headers,
        body: reqBody,
      });

      const resText = await res.text();
      const duration = Math.round(performance.now() - start);
      logRequest?.("POST", "/api/proxy/embed", res.status, duration, "cloud", reqBody, resText);

      if (!res.ok) {
        throw new Error(`Cloud embed failed (${res.status}): ${resText}`);
      }

      const data = JSON.parse(resText) as { data?: Array<{ embedding: number[] }> };
      trackUsage?.("embedding_requests");
      trackUsage?.("embedding_chunks", texts.length);
      return (data.data ?? []).map((d) => d.embedding);
    },

    async generatePurpose(path: string, content: string, exports: string[], docstring: string): Promise<string> {
      const prompt = [
        `File: ${path}`,
        exports.length ? `Exports: ${exports.join(", ")}` : "",
        docstring ? `Docstring: ${docstring}` : "",
        "",
        content.slice(0, 2000),
      ]
        .filter(Boolean)
        .join("\n");

      const start = performance.now();
      const reqBody = JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "You are a code analyst. Output ONLY a 1-sentence purpose summary for the given file. No preamble.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 128,
      });
      const res = await fetch(`${CLOUD_API_URL}/api/proxy/chat`, {
        method: "POST",
        headers,
        body: reqBody,
      });

      const resText = await res.text();
      const duration = Math.round(performance.now() - start);
      logRequest?.("POST", "/api/proxy/chat", res.status, duration, "cloud", reqBody, resText);

      if (!res.ok) {
        throw new Error(`Cloud purpose failed (${res.status}): ${resText}`);
      }

      const data = JSON.parse(resText) as { choices?: Array<{ message?: { content?: string } }> };
      trackUsage?.("purpose_requests");
      return data.choices?.[0]?.message?.content?.trim() ?? "";
    },
  };
}
