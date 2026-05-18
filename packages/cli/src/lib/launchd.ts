import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

export const PLIST_LABEL = "com.lens.daemon";
export const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${PLIST_LABEL}.plist`);
export const LOG_PATH = join(homedir(), ".lens", "daemon.log");

export function isMacOS(): boolean {
  return platform() === "darwin";
}

export interface PlistOptions {
  nodePath: string;
  daemonEntry: string;
  extraEnv?: Record<string, string>;
}

export function renderPlist({ nodePath, daemonEntry, extraEnv = {} }: PlistOptions): string {
  const env: Record<string, string> = {
    PATH: `${dirname(nodePath)}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
    HOME: homedir(),
    LENS_DAEMON: "1",
    ...extraEnv,
  };
  const envEntries = Object.entries(env)
    .map(([k, v]) => `      <key>${escapeXml(k)}</key>\n      <string>${escapeXml(v)}</string>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(nodePath)}</string>
    <string>${escapeXml(daemonEntry)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(LOG_PATH)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(LOG_PATH)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${envEntries}
  </dict>
</dict>
</plist>
`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function writePlist(contents: string): void {
  mkdirSync(dirname(PLIST_PATH), { recursive: true });
  writeFileSync(PLIST_PATH, contents);
}

export function bootstrapPlist(): void {
  const domain = `gui/${process.getuid?.() ?? ""}`;
  try {
    execFileSync("launchctl", ["bootout", domain, PLIST_PATH], { stdio: "ignore" });
  } catch {
    // not loaded — fine
  }
  execFileSync("launchctl", ["bootstrap", domain, PLIST_PATH], { stdio: "inherit" });
}

export function unloadPlist(): void {
  const domain = `gui/${process.getuid?.() ?? ""}`;
  try {
    execFileSync("launchctl", ["bootout", domain, PLIST_PATH], { stdio: "ignore" });
  } catch {
    // already unloaded
  }
  if (existsSync(PLIST_PATH)) unlinkSync(PLIST_PATH);
}

export function plistStatus(): { installed: boolean; loaded: boolean; pid: number | null; lastExit: number | null } {
  const installed = existsSync(PLIST_PATH);
  let loaded = false;
  let pid: number | null = null;
  let lastExit: number | null = null;
  try {
    const out = execFileSync("launchctl", ["list"], { encoding: "utf-8" });
    for (const line of out.split("\n")) {
      const parts = line.split(/\s+/);
      if (parts[2] === PLIST_LABEL) {
        loaded = true;
        const pidParsed = parseInt(parts[0], 10);
        const exitParsed = parseInt(parts[1], 10);
        pid = Number.isNaN(pidParsed) ? null : pidParsed;
        lastExit = Number.isNaN(exitParsed) ? null : exitParsed;
        break;
      }
    }
  } catch {}
  return { installed, loaded, pid, lastExit };
}

export function readPlist(): string | null {
  try {
    return readFileSync(PLIST_PATH, "utf-8");
  } catch {
    return null;
  }
}
