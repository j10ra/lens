#!/usr/bin/env node
import { Command } from "commander";
import { registerCommand } from "./commands/register.js";
import { contextCommand } from "./commands/context.js";
import { indexCommand } from "./commands/index.js";
import { statusCommand } from "./commands/status.js";
import { listCommand } from "./commands/list.js";
import { removeCommand } from "./commands/remove.js";
import { daemonStatsCommand } from "./commands/daemon-stats.js";
import { watchCommand, unwatchCommand, watchStatusCommand } from "./commands/watch.js";
import { configGetCommand, configSetCommand } from "./commands/config.js";
import { startCommand, stopCommand } from "./commands/daemon-ctrl.js";

import { dashboardCommand } from "./commands/dashboard.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { error } from "./util/format.js";
import { isTelemetryEnabled } from "./util/config.js";

const program = new Command().name("lens").description("LENS — Local-first repo context engine").version("0.1.6");

function trackCommand(name: string): void {
  if (!isTelemetryEnabled()) return;
  const BASE_URL = process.env.LENS_HOST ?? "http://127.0.0.1:4111";
  fetch(`${BASE_URL}/telemetry/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: "command", event_data: { command_name: name } }),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {});
}

// lens repo register | list | remove
const repo = program.command("repo").description("Repo management");
repo
  .command("register")
  .description("Register current repo with the daemon")
  .option("--json", "Output as JSON", false)
  .option("--inject", "Inject LENS instructions into existing CLAUDE.md", false)
  .action((opts) => run(() => registerCommand(opts), "repo register"));

repo
  .command("list")
  .description("List all registered repos")
  .option("--json", "Output as JSON", false)
  .action((opts) => run(() => listCommand(opts)));

repo
  .command("remove")
  .description("Remove current repo and all its data")
  .option("--json", "Output as JSON", false)
  .option("--yes", "Skip confirmation", false)
  .action((opts) => run(() => removeCommand(opts)));

repo
  .command("watch")
  .description("Start file watcher for current repo")
  .option("--json", "Output as JSON", false)
  .action((opts) => run(() => watchCommand(opts)));

repo
  .command("unwatch")
  .description("Stop file watcher for current repo")
  .option("--json", "Output as JSON", false)
  .action((opts) => run(() => unwatchCommand(opts)));

repo
  .command("watch-status")
  .description("Show file watcher status for current repo")
  .option("--json", "Output as JSON", false)
  .action((opts) => run(() => watchStatusCommand(opts)));

// lens context "<goal>" — primary command
program
  .command("context <goal>")
  .description("Build an intelligent context pack for a goal")
  .option("--json", "Output as JSON", false)
  .action((goal, opts) => run(() => contextCommand(goal, opts), "context"));

// lens index
program
  .command("index")
  .description("Index the current repo")
  .option("--json", "Output as JSON", false)
  .option("--force", "Full re-scan (default: diff scan, changed files only)", false)
  .option("--status", "Show index status", false)
  .action((opts) => run(() => indexCommand(opts), "index"));

// lens status
program
  .command("status")
  .description("Show repo index/embedding status")
  .option("--json", "Output as JSON", false)
  .action((opts) => run(() => statusCommand(opts), "status"));

// lens daemon stats
const daemon = program.command("daemon").description("Daemon management");
daemon
  .command("stats")
  .description("Show global daemon statistics")
  .option("--json", "Output as JSON", false)
  .action((opts) => run(() => daemonStatsCommand(opts)));

daemon
  .command("start")
  .description("Start the LENS daemon")
  .action(() => run(() => startCommand()));

daemon
  .command("stop")
  .description("Stop the LENS daemon")
  .action(() => run(() => stopCommand()));

// lens dashboard
program
  .command("dashboard")
  .description("Open the LENS dashboard in browser")
  .action(() => run(() => dashboardCommand()));

// lens login / logout
program
  .command("login")
  .description("Authenticate with LENS cloud via browser OAuth")
  .option("--github", "Sign in with GitHub directly")
  .option("--google", "Sign in with Google directly")
  .action((opts) => run(() => loginCommand(opts)));

program
  .command("logout")
  .description("Clear LENS cloud authentication")
  .action(() => run(() => logoutCommand()));

// lens config
const cfg = program.command("config").description("Manage LENS CLI config");
cfg
  .command("get <key>")
  .description("Get config value (inject_behavior, show_progress)")
  .action((key) => run(() => configGetCommand(key)));
cfg
  .command("set <key> <value>")
  .description("Set config value (e.g. show_progress true, inject_behavior once)")
  .action((key, value) => run(() => configSetCommand(key, value)));

program.parse();

async function run(fn: () => Promise<void>, commandName?: string): Promise<void> {
  if (commandName) trackCommand(commandName);
  try {
    await fn();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
