import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { error, output } from "../util/format.js";

const LENS_DIR = join(homedir(), ".lens");
const PID_FILE = join(LENS_DIR, "daemon.pid");
const LOG_FILE = join(LENS_DIR, "daemon.log");

// --- Platform paths ---
const LAUNCH_AGENTS_DIR = join(homedir(), "Library", "LaunchAgents");
const PLIST_PATH = join(LAUNCH_AGENTS_DIR, "com.lens.daemon.plist");
const SYSTEMD_DIR = join(homedir(), ".config", "systemd", "user");
const SERVICE_PATH = join(SYSTEMD_DIR, "lens-daemon.service");
const WIN_REG_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const WIN_REG_NAME = "LensDaemon";

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

// --- macOS: LaunchAgent ---

function setupDarwin(daemonScript: string): void {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lens.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
        <string>${daemonScript}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>${LOG_FILE}</string>
    <key>StandardErrorPath</key>
    <string>${LOG_FILE}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>LENS_DAEMON</key>
        <string>1</string>
    </dict>
</dict>
</plist>
`;
  const existing = existsSync(PLIST_PATH) ? readFileSync(PLIST_PATH, "utf-8") : "";
  if (existing === plist) return;
  if (existing) {
    try {
      execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null`);
    } catch {}
  }
  mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
  writeFileSync(PLIST_PATH, plist);
  try {
    execSync(`launchctl load "${PLIST_PATH}" 2>/dev/null`);
  } catch {}
}

function teardownDarwin(): void {
  if (!existsSync(PLIST_PATH)) return;
  try {
    execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null`);
  } catch {}
}

// --- Linux: systemd user service ---

function setupLinux(daemonScript: string): void {
  const unit = `[Unit]
Description=LENS Daemon

[Service]
ExecStart=${process.execPath} ${daemonScript}
Restart=no
Environment=LENS_DAEMON=1
StandardOutput=append:${LOG_FILE}
StandardError=append:${LOG_FILE}

[Install]
WantedBy=default.target
`;
  const existing = existsSync(SERVICE_PATH) ? readFileSync(SERVICE_PATH, "utf-8") : "";
  if (existing === unit) return;
  mkdirSync(SYSTEMD_DIR, { recursive: true });
  writeFileSync(SERVICE_PATH, unit);
  try {
    execSync("systemctl --user daemon-reload 2>/dev/null");
  } catch {}
  try {
    execSync("systemctl --user enable lens-daemon.service 2>/dev/null");
  } catch {}
}

function teardownLinux(): void {
  try {
    execSync("systemctl --user disable lens-daemon.service 2>/dev/null");
  } catch {}
}

// --- Windows: Registry Run key ---

function setupWindows(daemonScript: string): void {
  const cmd = `"${process.execPath}" "${daemonScript}"`;
  try {
    const existing = execSync(`reg query "${WIN_REG_KEY}" /v ${WIN_REG_NAME} 2>nul`, { encoding: "utf-8" });
    if (existing.includes(cmd)) return;
  } catch {}
  try {
    execSync(`reg add "${WIN_REG_KEY}" /v ${WIN_REG_NAME} /t REG_SZ /d "${cmd}" /f 2>nul`);
  } catch {}
}

function teardownWindows(): void {
  try {
    execSync(`reg delete "${WIN_REG_KEY}" /v ${WIN_REG_NAME} /f 2>nul`);
  } catch {}
}

// --- Unified auto-start interface ---

function setupAutoStart(daemonScript: string): void {
  switch (process.platform) {
    case "darwin":
      setupDarwin(daemonScript);
      break;
    case "linux":
      setupLinux(daemonScript);
      break;
    case "win32":
      setupWindows(daemonScript);
      break;
  }
}

function removeAutoStart(): void {
  switch (process.platform) {
    case "darwin":
      teardownDarwin();
      break;
    case "linux":
      teardownLinux();
      break;
    case "win32":
      teardownWindows();
      break;
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

  mkdirSync(LENS_DIR, { recursive: true });
  setupAutoStart(daemonScript);

  // OS auto-start registration may have already started it
  if (isDaemonRunning().running) {
    const check = isDaemonRunning();
    output(`LENS daemon started (pid: ${check.pid})`, false);
    return;
  }

  const logFd = openSync(LOG_FILE, "a");
  const child = spawn(process.execPath, [daemonScript], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env, LENS_DAEMON: "1" },
  });
  child.unref();

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (isDaemonRunning().running) break;
  }

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

  removeAutoStart();
  process.kill(status.pid!, "SIGTERM");

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (!isDaemonRunning().running) {
      output(`LENS daemon stopped (pid: ${status.pid})`, false);
      return;
    }
  }

  error(`Daemon did not stop within 5s. Force kill with: kill -9 ${status.pid}`);
}
