import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONFIG_PATH = join(homedir(), ".lens", "config.json");

/** Default cloud API base URL — override via LENS_CLOUD_URL env or cloud_url in ~/.lens/config.json */
export const DEFAULT_CLOUD_URL = "https://cloud.lens-engine.com";

function readConfig(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeConfig(cfg: Record<string, unknown>): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

export function getCloudUrl(): string {
  if (process.env.LENS_CLOUD_URL) return process.env.LENS_CLOUD_URL;
  const cfg = readConfig();
  if (cfg.cloud_url) return cfg.cloud_url as string;
  return DEFAULT_CLOUD_URL;
}

export function ensureTelemetryId(): { telemetry_id: string; first_run: boolean } {
  const cfg = readConfig();
  if (cfg.telemetry_id) {
    return { telemetry_id: cfg.telemetry_id as string, first_run: false };
  }
  const id = randomUUID();
  cfg.telemetry_id = id;
  if (cfg.telemetry === undefined) cfg.telemetry = true;
  writeConfig(cfg);
  return { telemetry_id: id, first_run: true };
}

export function isTelemetryEnabled(): boolean {
  const cfg = readConfig();
  return cfg.telemetry !== false;
}

export function getTelemetryId(): string | null {
  const cfg = readConfig();
  return (cfg.telemetry_id as string) ?? null;
}
