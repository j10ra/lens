import type { Capabilities } from "@lens/engine";
import { getCloudUrl } from "./config";

export function createCloudCapabilities(apiKey: string): Capabilities {
  const CLOUD_API_URL = getCloudUrl();
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  return {
    async embedTexts(texts: string[], isQuery?: boolean): Promise<number[][]> {
      const res = await fetch(`${CLOUD_API_URL}/api/proxy/embed`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          input: texts,
          model: "voyage-code-3",
          input_type: isQuery ? "query" : "document",
        }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`Cloud embed failed (${res.status}): ${err}`);
      }

      const data = await res.json() as { data?: Array<{ embedding: number[] }> };
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

      const res = await fetch(`${CLOUD_API_URL}/api/proxy/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: [
            { role: "system", content: "You are a code analyst. Output ONLY a 1-sentence purpose summary for the given file. No preamble." },
            { role: "user", content: prompt },
          ],
          max_tokens: 128,
        }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`Cloud purpose failed (${res.status}): ${err}`);
      }

      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content?.trim() ?? "";
    },
  };
}
