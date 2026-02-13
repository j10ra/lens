import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CONFIG_DIR = path.join(os.homedir(), ".lens");
const AUTH_FILE = path.join(CONFIG_DIR, "auth.json");

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user_email: string;
  expires_at: number;
  api_key?: string;
}

export async function readAuth(): Promise<AuthTokens | null> {
  try {
    const raw = await fs.readFile(AUTH_FILE, "utf-8");
    return JSON.parse(raw) as AuthTokens;
  } catch {
    return null;
  }
}

export async function writeAuth(tokens: AuthTokens): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(AUTH_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export async function clearAuth(): Promise<void> {
  try {
    await fs.unlink(AUTH_FILE);
  } catch {
    // already gone
  }
}
