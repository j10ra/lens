import { detectRepo } from "../util/repo.js";
import { post } from "../util/client.js";
import { output } from "../util/format.js";
import { injectClaudeMd } from "../util/inject-claude-md.js";
import { injectMcp } from "../util/inject-mcp.js";
import { showProgress } from "../util/progress.js";
import { readConfig } from "../util/config.js";

interface RegisterResponse {
  repo_id: string;
  identity_key: string;
  name: string;
  created: boolean;
}

export async function registerCommand(opts: { json: boolean; inject: boolean }): Promise<void> {
  const info = await detectRepo();
  const res = await post<RegisterResponse>("/repo/register", {
    root_path: info.root_path,
    name: info.name,
    remote_url: info.remote_url,
  });

  if (opts.json) {
    output(res, true);
    return;
  }

  // Always ensure MCP config exists
  const mcpResult = injectMcp(info.root_path);

  if (res.created) {
    await injectClaudeMd(info.root_path);

    output(`Registered ${res.name} (repo_id: ${res.repo_id})`, false);
    if (mcpResult === "created" || mcpResult === "updated") {
      output(`Wrote .mcp.json → Claude Code will auto-discover LENS`, false);
    }

    const config = await readConfig();
    if (config.show_progress) {
      await showProgress(res.repo_id, res.name);
    } else {
      output(`Indexing started. Run \`lens status\` to check progress.`, false);
    }
  } else {
    output(`Already registered ${res.name} (repo_id: ${res.repo_id})`, false);

    if (mcpResult === "created" || mcpResult === "updated") {
      output(`Wrote .mcp.json → Claude Code will auto-discover LENS`, false);
    }

    if (opts.inject) {
      await injectClaudeMd(info.root_path);
      output(`Injected LENS instructions into CLAUDE.md`, false);
    }
  }
}
