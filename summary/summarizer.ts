import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { db } from "../repo/db";
import { chat } from "./llm";

export interface FileSummary {
  summary: string;
  key_exports: string[];
  dependencies: string[];
}

const FILE_PROMPT = `Analyze this source file and respond with ONLY valid JSON (no markdown, no code fences):
{
  "summary": "3-5 sentence description of what this file does",
  "key_exports": ["exported function/class/type names"],
  "dependencies": ["import paths"]
}

Be precise and technical. Focus on purpose, not implementation details.`;

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function summarizeFile(
  repoId: string,
  rootPath: string,
  filePath: string,
): Promise<FileSummary & { cached: boolean }> {
  const abs = resolve(rootPath, filePath);
  const content = await readFile(abs, "utf-8");
  const hash = contentHash(content);

  // Check cache
  const cached = await db.queryRow<{
    summary: string;
    key_exports: string[];
    dependencies: string[];
  }>`
    SELECT summary, key_exports, dependencies FROM summaries
    WHERE repo_id = ${repoId} AND path = ${filePath}
      AND level = 'file' AND content_hash = ${hash}
  `;

  if (cached) {
    return {
      summary: cached.summary,
      key_exports: cached.key_exports ?? [],
      dependencies: cached.dependencies ?? [],
      cached: true,
    };
  }

  const lang = extname(filePath).slice(1) || "text";

  // Truncate large files to ~8000 chars for token budget
  const truncated = content.length > 8000
    ? content.slice(0, 8000) + "\n... (truncated)"
    : content;

  // GLM-4.7 is a reasoning model — reasoning_content eats into max_tokens.
  // Need high limit so reasoning + actual content both fit.
  const raw = await chat([
    { role: "system", content: FILE_PROMPT },
    { role: "user", content: `File: ${filePath} (${lang})\n\n${truncated}` },
  ], 4096);

  let parsed: FileSummary;
  try {
    // Strip markdown code fences if LLM wraps response
    const cleaned = raw.replace(/^```json?\s*\n?/gm, "").replace(/\n?```\s*$/gm, "").trim();
    const obj = JSON.parse(cleaned);
    parsed = {
      summary: obj.summary || obj.description || raw.trim(),
      key_exports: Array.isArray(obj.key_exports) ? obj.key_exports : [],
      dependencies: Array.isArray(obj.dependencies) ? obj.dependencies : [],
    };
  } catch {
    parsed = { summary: raw.trim(), key_exports: [], dependencies: [] };
  }

  if (!parsed.summary) {
    parsed.summary = `(Auto-summary for ${filePath})`;
  }

  // Upsert into DB
  await db.exec`
    INSERT INTO summaries (repo_id, path, level, content_hash, summary, key_exports, dependencies)
    VALUES (
      ${repoId}, ${filePath}, 'file', ${hash},
      ${parsed.summary},
      ${JSON.stringify(parsed.key_exports)}::jsonb,
      ${JSON.stringify(parsed.dependencies)}::jsonb
    )
    ON CONFLICT (repo_id, path, level, content_hash) DO UPDATE
    SET summary = EXCLUDED.summary,
        key_exports = EXCLUDED.key_exports,
        dependencies = EXCLUDED.dependencies,
        updated_at = now()
  `;

  return { ...parsed, cached: false };
}
