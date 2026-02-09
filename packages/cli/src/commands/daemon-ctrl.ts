import { existsSync, readFileSync, writeFileSync, unlinkSync, openSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { output, error } from "../util/format.js";

const LENS_DIR = join(homedir(), ".lens");
const PID_FILE = join(LENS_DIR, "daemon.pid");
const LOG_FILE = join(LENS_DIR, "daemon.log");

function isDaemonRunning(): { running: boolean; pid?: number } {
  if (!existsSync(PID_FILE)) return { running: false };
  const pid = Number(readFileSync(PID_FILE, "utf-8").trim());
  try {
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    unlinkSync(PID_FILE);
    return { running: false };
  }
}

export async function startCommand(): Promise<void> {
  const status = isDaemonRunning();
  if (status.running) {
    output(`LENS daemon already running (pid: ${status.pid})`, false);
    return;
  }

  const selfDir = dirname(fileURLToPath(import.meta.url));
  const sibling = join(selfDir, "daemon.js");
  let daemonScript: string;
  if (existsSync(sibling)) {
    daemonScript = sibling;
  } else {
    try {
      const require = createRequire(import.meta.url);
      daemonScript = require.resolve("@lens/daemon");
    } catch {
      error("Could not find @lens/daemon. Run `pnpm build` first.");
      return;
    }
  }

  const logFd = openSync(LOG_FILE, "a");
  const child = spawn(process.execPath, [daemonScript], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, LENS_DAEMON: "1" },
  });
  child.unref();

  await new Promise((r) => setTimeout(r, 500));

  const check = isDaemonRunning();
  if (check.running) {
    output(`LENS daemon started (pid: ${check.pid})`, false);
  } else {
    error(`LENS daemon failed to start. Check logs: ${LOG_FILE}`);
  }
}

export async function stopCommand(): Promise<void> {
  const status = isDaemonRunning();
  if (!status.running) {
    output("LENS daemon is not running", false);
    return;
  }

  process.kill(status.pid!, "SIGTERM");

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (!isDaemonRunning().running) {
      output(`LENS daemon stopped (pid: ${status.pid})`, false);
      return;
    }
  }

  error("Daemon did not stop within 5s. Force kill with: kill -9 " + status.pid);
}
