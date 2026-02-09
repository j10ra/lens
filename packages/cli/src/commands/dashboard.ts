import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { exec } from "node:child_process";
import { output, error } from "../util/format.js";

const PID_FILE = join(homedir(), ".lens", "daemon.pid");

function isDaemonRunning(): boolean {
  if (!existsSync(PID_FILE)) return false;
  const pid = Number(readFileSync(PID_FILE, "utf-8").trim());
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} ${url}`);
}

export async function dashboardCommand(): Promise<void> {
  if (!isDaemonRunning()) {
    error("LENS daemon is not running. Start with: lens daemon start");
    return;
  }

  const port = process.env.LENS_PORT || "4111";
  const host = process.env.LENS_HOST || `http://127.0.0.1:${port}`;
  const url = `${host}/dashboard`;

  output(`Opening ${url}`, false);
  openBrowser(url);
}
