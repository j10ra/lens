import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

const CONFIG_DIR = path.join(os.homedir(), ".lens");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface Config {
  inject_behavior: "always" | "skip" | "once";
  show_progress: boolean;
  cloud_url?: string;
  telemetry?: boolean;
  telemetry_id?: string;
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
  } else if (key === "cloud_url") {
    config.cloud_url = value;
  } else if (key === "telemetry") {
    config.telemetry = value === "true";
  } else {
    throw new Error(`Invalid config: ${key}=${value}`);
  }

  await writeConfig(config);
}

export function getCloudUrl(): string {
  if (process.env.LENS_CLOUD_URL) return process.env.LENS_CLOUD_URL;
  try {
    const cfg = JSON.parse(fsSync.readFileSync(CONFIG_FILE, "utf-8"));
    if (cfg.cloud_url) return cfg.cloud_url;
  } catch {}
  return "https://lens-production-e9fd.up.railway.app";
}

export function readConfigSync(): Config {
  try {
    return { ...DEFAULTS, ...JSON.parse(fsSync.readFileSync(CONFIG_FILE, "utf-8")) };
  } catch {
    return DEFAULTS;
  }
}

function writeConfigSync(config: Config): void {
  fsSync.mkdirSync(CONFIG_DIR, { recursive: true });
  fsSync.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function ensureTelemetryId(): { telemetry_id: string; first_run: boolean } {
  const config = readConfigSync();
  if (config.telemetry_id) {
    return { telemetry_id: config.telemetry_id, first_run: false };
  }
  const id = randomUUID();
  config.telemetry_id = id;
  if (config.telemetry === undefined) config.telemetry = true;
  writeConfigSync(config);
  return { telemetry_id: id, first_run: true };
}

export function isTelemetryEnabled(): boolean {
  const config = readConfigSync();
  return config.telemetry !== false;
}
