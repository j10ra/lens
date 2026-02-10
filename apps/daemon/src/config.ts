import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_PATH = join(homedir(), ".lens", "config.json");

export function getCloudUrl(): string {
  if (process.env.LENS_CLOUD_URL) return process.env.LENS_CLOUD_URL;
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    if (cfg.cloud_url) return cfg.cloud_url;
  } catch {}
  return "https://lens.dev";
}
