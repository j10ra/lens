import { createHash } from "node:crypto";
import { db } from "../repo/db";
import { chat } from "./llm";

interface DirChildSummary {
  path: string;
  summary: string;
}

const DIR_PROMPT = `Summarize this directory's purpose in 2-3 sentences based on its children.
Respond with ONLY valid JSON (no markdown, no code fences):
{ "summary": "2-3 sentence description" }`;

export async function summarizeDirectory(
  repoId: string,
  dirPath: string,
  children: DirChildSummary[],
): Promise<{ summary: string; cached: boolean }> {
  // content_hash for directories = hash of sorted child summaries
  const childDigest = children
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((c) => `${c.path}:${c.summary}`)
    .join("\n");
  const hash = createHash("sha256").update(childDigest).digest("hex");

  // Check cache
  const cached = await db.queryRow<{ summary: string }>`
    SELECT summary FROM summaries
    WHERE repo_id = ${repoId} AND path = ${dirPath}
      AND level = 'directory' AND content_hash = ${hash}
  `;

  if (cached) {
    return { summary: cached.summary, cached: true };
  }

  const listing = children
    .map((c) => `- ${c.path}: ${c.summary}`)
    .join("\n");

  const raw = await chat([
    { role: "system", content: DIR_PROMPT },
    { role: "user", content: `Directory: ${dirPath}/\n\nChildren:\n${listing}` },
  ], 2048);

  let summary: string;
  try {
    const cleaned = raw.replace(/^```json?\s*\n?/gm, "").replace(/\n?```\s*$/gm, "").trim();
    summary = JSON.parse(cleaned).summary || raw.trim();
  } catch {
    summary = raw.trim();
  }

  if (!summary) summary = `Directory containing: ${children.map((c) => c.path).join(", ")}`;

  await db.exec`
    INSERT INTO summaries (repo_id, path, level, content_hash, summary, key_exports, dependencies)
    VALUES (${repoId}, ${dirPath}, 'directory', ${hash}, ${summary}, '[]'::jsonb, '[]'::jsonb)
    ON CONFLICT (repo_id, path, level, content_hash) DO UPDATE
    SET summary = EXCLUDED.summary, updated_at = now()
  `;

  return { summary, cached: false };
}
