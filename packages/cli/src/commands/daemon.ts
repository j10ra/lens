import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineCommand } from "citty";

const DATA_DIR = join(homedir(), ".lens");
const PID_FILE = join(DATA_DIR, "daemon.pid");
const LOG_FILE = join(DATA_DIR, "daemon.log");

/** Resolve daemon entry — published (sibling) or monorepo (workspace dep). */
function findDaemonEntry(): string {
  const self = fileURLToPath(import.meta.url);
  const sibling = join(dirname(self), "daemon.js");
  if (existsSync(sibling)) return sibling;

  const req = createRequire(import.meta.url);
  return req.resolve("@lens/daemon");
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(): number | null {
  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    return Number.isNaN(pid) ? null : isRunning(pid) ? pid : null;
  } catch {
    return null;
  }
}

const start = defineCommand({
  meta: { description: "Start the LENS daemon in the background." },
  args: {
    foreground: {
      type: "boolean",
      alias: "f",
      description: "Run in foreground (don't daemonize)",
    },
  },
  async run({ args }) {
    const existing = readPid();
    if (existing) {
      console.log(`Daemon already running (PID ${existing})`);
      return;
    }

    mkdirSync(DATA_DIR, { recursive: true });

    const daemonEntry = findDaemonEntry();

    if (args.foreground) {
      const child = spawn("node", [daemonEntry], {
        stdio: "inherit",
        env: { ...process.env, LENS_DATA_DIR: DATA_DIR },
      });
      writeFileSync(PID_FILE, String(child.pid));
      child.on("exit", (code) => {
        try {
          unlinkSync(PID_FILE);
        } catch {}
        process.exit(code ?? 1);
      });
      return;
    }

    const out = openSync(LOG_FILE, "a");
    const child = spawn("node", [daemonEntry], {
      detached: true,
      stdio: ["ignore", out, out],
      env: { ...process.env, LENS_DATA_DIR: DATA_DIR },
    });
    child.unref();

    writeFileSync(PID_FILE, String(child.pid));

    const ok = await waitForHealth(1500);
    if (ok) {
      console.log(`Daemon started (PID ${child.pid})`);
      console.log(`  http://localhost:4111`);
      console.log(`  logs: ${LOG_FILE}`);
    } else {
      console.error("Daemon process started but health check failed.");
      console.error(`  Check logs: ${LOG_FILE}`);
      process.exit(1);
    }
  },
});

async function waitForHealth(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch("http://localhost:4111/api/cli/health");
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

const stop = defineCommand({
  meta: { description: "Stop the LENS daemon." },
  async run() {
    const pid = readPid();
    if (!pid) {
      console.log("Daemon is not running.");
      return;
    }

    process.kill(pid, "SIGTERM");
    try {
      unlinkSync(PID_FILE);
    } catch {}
    console.log(`Daemon stopped (PID ${pid})`);
  },
});

export const daemon = defineCommand({
  meta: { description: "Manage the LENS daemon process." },
  subCommands: { start, stop },
});
