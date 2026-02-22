import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const MARKER = "<!-- lens-context -->";

const CANDIDATE_FILES = [
  "CLAUDE.md",
  "AGENTS.md",
  ".github/copilot-instructions.md",
  ".cursorrules",
  ".windsurfrules",
  ".clinerules",
  ".roorules",
];

const TEMPLATE = `${MARKER}
## LENS — Structural Code Search

This repo is indexed by LENS. **Prefer LENS MCP tools over built-in Grep/Glob** for code search:
- \`lens_grep\` — Ranked search with import graph, co-change, hub scores. One call replaces multiple Grep+Read cycles.
- \`lens_graph\` — Dependency map. Architecture, module relationships, change impact.
- \`lens_graph_neighbors\` — Blast radius for a file. Importers, co-change partners, what breaks.

Load tools via \`ToolSearch\` before first use.
`;

export interface InjectionResult {
  file: string;
  action: "injected" | "skipped" | "created";
}

export function injectInstructions(repoRoot: string): InjectionResult[] {
  const results: InjectionResult[] = [];
  const found: string[] = [];

  for (const file of CANDIDATE_FILES) {
    const fullPath = join(repoRoot, file);
    if (existsSync(fullPath)) {
      found.push(file);
      const content = readFileSync(fullPath, "utf-8");
      if (content.includes(MARKER)) {
        results.push({ file, action: "skipped" });
      } else {
        writeFileSync(fullPath, `${TEMPLATE}\n${content}`);
        results.push({ file, action: "injected" });
      }
    }
  }

  // No instruction files found — create defaults
  if (found.length === 0) {
    for (const file of ["CLAUDE.md", "AGENTS.md"]) {
      const fullPath = join(repoRoot, file);
      const dir = dirname(fullPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, `${TEMPLATE}\n`);
      results.push({ file, action: "created" });
    }
  }

  return results;
}
