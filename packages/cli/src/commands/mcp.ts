import { output } from "../util/format.js";
import { injectMcp } from "../util/inject-mcp.js";
import { detectRepo } from "../util/repo.js";

export async function mcpCommand(): Promise<void> {
  const { root_path } = await detectRepo();
  const result = injectMcp(root_path);

  if (result === "exists") {
    output("LENS MCP entry already present in .mcp.json", false);
  } else {
    output("Wrote .mcp.json — agents will auto-discover LENS", false);
  }
}
