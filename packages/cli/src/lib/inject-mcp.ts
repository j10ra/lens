import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LENS_MCP_ENTRY = {
  type: "http",
  url: "http://localhost:4111/mcp",
};

interface McpConfig {
  mcpServers?: Record<string, unknown>;
}

export function injectMcp(repoRoot: string): "created" | "exists" | "updated" {
  const mcpPath = join(repoRoot, ".mcp.json");

  if (!existsSync(mcpPath)) {
    writeFileSync(mcpPath, `${JSON.stringify({ mcpServers: { lens: LENS_MCP_ENTRY } }, null, 2)}\n`);
    return "created";
  }

  const raw = readFileSync(mcpPath, "utf-8");
  const config: McpConfig = JSON.parse(raw);

  if (config.mcpServers?.lens) return "exists";

  config.mcpServers = { ...config.mcpServers, lens: LENS_MCP_ENTRY };
  writeFileSync(mcpPath, `${JSON.stringify(config, null, 2)}\n`);
  return "updated";
}
