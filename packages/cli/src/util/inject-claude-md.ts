import fs from "node:fs/promises";
import path from "node:path";
import { get } from "./client.js";
import { readConfig } from "./config.js";

const RLM_MARKER = "lens context";

// Search order: root files first (more likely to be user's main file), then .claude/
const CANDIDATE_PATHS = ["CLAUDE.md", "agents.md", "AGENTS.md", ".CLAUDE.md", ".agents.md", ".AGENTS.md"];

async function findTargetFile(repoRoot: string): Promise<string | null> {
  for (const relPath of CANDIDATE_PATHS) {
    const fullPath = path.join(repoRoot, relPath);
    try {
      await fs.access(fullPath);
      return fullPath;
    } catch {}
  }
  return null;
}

export async function injectClaudeMd(repoRoot: string): Promise<void> {
  // Find existing file or create CLAUDE.md in root
  const existingFile = await findTargetFile(repoRoot);
  const targetFile = existingFile ?? path.join(repoRoot, "CLAUDE.md");

  // Read existing content
  let existingContent = "";
  try {
    existingContent = await fs.readFile(targetFile, "utf-8");
    if (existingContent.toLowerCase().includes(RLM_MARKER)) {
      return; // Already has LENS content
    }
  } catch {
    // File doesn't exist — will create new
  }

  const config = await readConfig();
  if (existingFile && config.inject_behavior === "once") {
    return; // Existing file, don't modify unless "always"
  }
  if (config.inject_behavior === "skip") {
    return;
  }

  // Fetch template from daemon
  const { content } = await get<{ content: string }>("/repo/template");

  // Write content
  if (existingContent) {
    // Prepend LENS content to existing
    await fs.writeFile(targetFile, `${content}\n\n${existingContent}`);
  } else {
    // Create new file in root
    await fs.writeFile(targetFile, content);
  }
}
