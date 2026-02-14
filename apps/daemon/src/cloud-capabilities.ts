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

export type KeyGetter = () => Promise<string | null>;
export type KeyRefresher = () => Promise<string | null>;

export function createCloudCapabilities(
  getKey: KeyGetter,
  refreshKey: KeyRefresher,
  trackUsage?: UsageTracker,
  logRequest?: RequestLogger,
): Capabilities {
  const CLOUD_API_URL = getCloudUrl();

  async function cloudFetch(path: string, reqBody: string): Promise<{ res: Response; resText: string }> {
    const apiKey = await getKey();
    if (!apiKey) throw new Error("No API key available");

    const start = performance.now();
    let res = await fetch(`${CLOUD_API_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: reqBody,
    });
    let resText = await res.text();
    let duration = Math.round(performance.now() - start);
    logRequest?.("POST", path, res.status, duration, "cloud", reqBody, resText);

    // 401 retry: re-provision key and try once more
    if (res.status === 401) {
      const newKey = await refreshKey();
      if (newKey) {
        const retryStart = performance.now();
        res = await fetch(`${CLOUD_API_URL}${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${newKey}`, "Content-Type": "application/json" },
          body: reqBody,
        });
        resText = await res.text();
        duration = Math.round(performance.now() - retryStart);
        logRequest?.("POST", path, res.status, duration, "cloud-retry", reqBody, resText);
      }
    }

    return { res, resText };
  }

  return {
    async embedTexts(texts: string[], isQuery?: boolean): Promise<number[][]> {
      const reqBody = JSON.stringify({
        input: texts,
        model: "voyage-code-3",
        input_type: isQuery ? "query" : "document",
      });
      const { res, resText } = await cloudFetch("/api/proxy/embed", reqBody);
      if (!res.ok) throw new Error(`Cloud embed failed (${res.status}): ${resText}`);

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
      const { res, resText } = await cloudFetch("/api/proxy/chat", reqBody);
      if (!res.ok) throw new Error(`Cloud purpose failed (${res.status}): ${resText}`);

      const data = JSON.parse(resText) as { choices?: Array<{ message?: { content?: string } }> };
      trackUsage?.("purpose_requests");
      return data.choices?.[0]?.message?.content?.trim() ?? "";
    },
  };
}
