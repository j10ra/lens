import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { output } from "../util/format.js";
import { detectRepo } from "../util/repo.js";

export async function initCommand(): Promise<void> {
  const { root_path } = await detectRepo();
  const mcpPath = join(root_path, ".mcp.json");

  let existing: Record<string, unknown> = {};
  if (existsSync(mcpPath)) {
    try {
      existing = JSON.parse(readFileSync(mcpPath, "utf-8"));
    } catch {
      // malformed, overwrite
    }
  }

  if (!existing.mcpServers) existing.mcpServers = {};
  (existing.mcpServers as Record<string, unknown>).lens = {
    command: "npx",
    args: ["lens-daemon", "--stdio"],
  };

  writeFileSync(mcpPath, JSON.stringify(existing, null, 2) + "\n");
  output(`Wrote .mcp.json → Claude Code will auto-discover LENS`, false);
}
