import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const CONFIG_DIR = path.join(os.homedir(), ".lens");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface Config {
  inject_behavior: "always" | "skip" | "once";
  show_progress: boolean;
}

const DEFAULTS: Config = {
  inject_behavior: "always",
  show_progress: true,
};

export async function readConfig(): Promise<Config> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

async function writeConfig(config: Config): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function configGet(key: string): Promise<string> {
  const config = await readConfig();
  if (key in config) {
    return JSON.stringify(config[key as keyof Config], null, 2);
  }
  return "null";
}

export async function configSet(key: string, value: string): Promise<void> {
  const config = await readConfig();

  if (key === "inject_behavior" && ["always", "skip", "once"].includes(value)) {
    config.inject_behavior = value as Config["inject_behavior"];
  } else if (key === "show_progress") {
    config.show_progress = value === "true";
  } else {
    throw new Error(`Invalid config: ${key}=${value}`);
  }

  await writeConfig(config);
}
