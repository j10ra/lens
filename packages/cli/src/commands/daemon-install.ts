import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineCommand } from "citty";
import {
  bootstrapPlist,
  isMacOS,
  PLIST_PATH,
  plistStatus,
  readPlist,
  renderPlist,
  unloadPlist,
  writePlist,
} from "../lib/launchd.js";

function findDaemonEntry(): string {
  const self = fileURLToPath(import.meta.url);
  const sibling = join(dirname(self), "daemon.js");
  if (existsSync(sibling)) return sibling;
  const req = createRequire(import.meta.url);
  return req.resolve("@lens/daemon");
}

export const install = defineCommand({
  meta: {
    description: "Install LENS daemon as a launchd service (auto-start at login, auto-restart on crash/sleep).",
  },
  async run() {
    if (!isMacOS()) {
      console.error("`lens daemon install` is macOS-only. On Linux use systemd; on Windows use Task Scheduler.");
      process.exit(1);
    }

    const daemonEntry = findDaemonEntry();
    const nodePath = process.execPath;
    const plist = renderPlist({ nodePath, daemonEntry });

    const existing = readPlist();
    if (existing === plist) {
      console.log(`Plist already up to date: ${PLIST_PATH}`);
    } else {
      writePlist(plist);
      console.log(`Wrote plist: ${PLIST_PATH}`);
    }

    bootstrapPlist();
    const status = plistStatus();
    if (status.loaded) {
      console.log(`Loaded (PID ${status.pid ?? "starting"}).`);
      console.log("RunAtLoad=true, KeepAlive=true.");
      console.log("Daemon will survive logout, reboot, sleep/wake, and crashes.");
    } else {
      console.error("launchctl bootstrap reported success but service not visible. Check Console.app for errors.");
      process.exit(1);
    }
  },
});

export const uninstall = defineCommand({
  meta: { description: "Remove the LENS launchd service." },
  async run() {
    if (!isMacOS()) {
      console.error("`lens daemon uninstall` is macOS-only.");
      process.exit(1);
    }
    unloadPlist();
    console.log("LENS daemon launchd service removed.");
  },
});

export const statusCmd = defineCommand({
  meta: { description: "Show LENS daemon launchd status." },
  async run() {
    if (!isMacOS()) {
      console.error("`lens daemon status` shows launchd state (macOS-only).");
      process.exit(1);
    }
    const s = plistStatus();
    console.log(`plist:    ${s.installed ? PLIST_PATH : "(not installed)"}`);
    console.log(`loaded:   ${s.loaded}`);
    console.log(`pid:      ${s.pid ?? "(none)"}`);
    console.log(`lastExit: ${s.lastExit ?? "(none)"}`);
    if (s.installed && !s.loaded) {
      console.log("\nHint: run `lens daemon install` to load it.");
    }
  },
});
