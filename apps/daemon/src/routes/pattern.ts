import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { lensRoute } from "@lens/core";
import { getEngineDb, listRepos, metadataQueries, runPattern, type SupportedLanguage } from "@lens/engine";
import { Hono } from "hono";

export const patternRoutes = new Hono();

const SUPPORTED: SupportedLanguage[] = ["typescript", "tsx", "javascript", "csharp"];

const LANG_TO_EXT: Record<SupportedLanguage, string[]> = {
  typescript: ["typescript"],
  tsx: ["typescript"], // .tsx is detected as "typescript" by discovery.ts
  javascript: ["javascript"],
  csharp: ["csharp"],
};

patternRoutes.post(
  "/",
  lensRoute("pattern.post", async (c) => {
    const { repoPath, pattern, language, limit = 50, format = "json" } = await c.req.json();

    if (!pattern || typeof pattern !== "string") {
      return c.json({ error: "pattern is required (string)" }, 400);
    }
    if (!SUPPORTED.includes(language)) {
      return c.json({ error: `language must be one of: ${SUPPORTED.join(", ")}` }, 400);
    }

    const db = getEngineDb();
    const repos = await listRepos(db);
    const repo = repos.find((r) => r.root_path === repoPath || r.root_path === repoPath?.replace(/\/$/, ""));
    if (!repo) {
      return c.json({ error: "Repo not registered", hint: `Run: lens register ${repoPath}` }, 404);
    }

    const targetLangs = LANG_TO_EXT[language as SupportedLanguage];
    const allMeta = metadataQueries.getAllForRepo(db, repo.id);
    const candidates = allMeta.filter((m) => m.language && targetLangs.includes(m.language));

    const files = candidates
      .map((m) => {
        const abs = resolve(repo.root_path, m.path);
        try {
          return { path: m.path, content: readFileSync(abs, "utf-8") };
        } catch {
          return null;
        }
      })
      .filter((f): f is { path: string; content: string } => f !== null);

    const result = await runPattern({
      pattern,
      language: language as SupportedLanguage,
      files,
      limit,
    });

    if (format === "text") {
      return c.text(formatPatternText(result));
    }
    return c.json(result);
  }),
);

function formatPatternText(result: {
  matches: Array<{ path: string; line: number; text: string; captures: Record<string, string> }>;
  truncated: boolean;
}): string {
  if (result.matches.length === 0) {
    return "0 matches\n";
  }
  const lines = result.matches.map((m) => {
    const captures = Object.entries(m.captures)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    const head = m.text.split("\n")[0]?.trim().slice(0, 80) ?? "";
    return `${m.path}:${m.line}  ${head}${captures ? `  [${captures}]` : ""}`;
  });
  const footer = `\n${result.matches.length} match${result.matches.length === 1 ? "" : "es"}${result.truncated ? " (truncated)" : ""}`;
  return `${lines.join("\n")}${footer}\n`;
}
