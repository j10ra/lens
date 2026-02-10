import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MCP_ENTRY = {
  command: "npx",
  args: ["lens-daemon", "--stdio"],
};

/**
 * Ensures .mcp.json has the LENS MCP server entry.
 * Returns "created" | "exists" | "updated".
 */
export function injectMcp(repoRoot: string): "created" | "exists" | "updated" {
  const mcpPath = join(repoRoot, ".mcp.json");

  let existing: Record<string, unknown> = {};
  if (existsSync(mcpPath)) {
    try {
      existing = JSON.parse(readFileSync(mcpPath, "utf-8"));
    } catch {
      // malformed, overwrite
    }
  }

  if (!existing.mcpServers) existing.mcpServers = {};
  const servers = existing.mcpServers as Record<string, unknown>;

  // Already has lens entry
  if (servers.lens) return "exists";

  const isNew = !existsSync(mcpPath);
  servers.lens = MCP_ENTRY;
  writeFileSync(mcpPath, `${JSON.stringify(existing, null, 2)}\n`);

  return isNew ? "created" : "updated";
}
