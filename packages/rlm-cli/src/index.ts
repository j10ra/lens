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
import { error } from "./util/format.js";

const program = new Command()
  .name("rlm")
  .description("RLM — Local Repo Language Model Daemon CLI")
  .version("0.1.0");

// rlm repo register | list | remove
const repo = program.command("repo").description("Repo management");
repo
  .command("register")
  .description("Register current repo with the daemon")
  .option("--json", "Output as JSON", false)
  .option("--inject", "Inject RLM instructions into existing CLAUDE.md", false)
  .action((opts) => run(() => registerCommand(opts)));

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

// rlm context "<goal>" — primary command
program
  .command("context <goal>")
  .description("Build an intelligent context pack for a goal")
  .option("--json", "Output as JSON", false)
  .action((goal, opts) => run(() => contextCommand(goal, opts)));

// rlm index
program
  .command("index")
  .description("Index the current repo")
  .option("--json", "Output as JSON", false)
  .option("--force", "Force full re-index", false)
  .option("--status", "Show index status", false)
  .action((opts) => run(() => indexCommand(opts)));

// rlm status
program
  .command("status")
  .description("Show repo index/embedding status")
  .option("--json", "Output as JSON", false)
  .action((opts) => run(() => statusCommand(opts)));

// rlm daemon stats
const daemon = program.command("daemon").description("Daemon management");
daemon
  .command("stats")
  .description("Show global daemon statistics")
  .option("--json", "Output as JSON", false)
  .action((opts) => run(() => daemonStatsCommand(opts)));

// rlm config
const cfg = program.command("config").description("Manage RLM CLI config");
cfg
  .command("get <key>")
  .description("Get config value (inject_behavior, show_progress)")
  .action((key) => run(() => configGetCommand(key)));
cfg
  .command("set <key> <value>")
  .description('Set config value (e.g. show_progress true, inject_behavior once)')
  .action((key, value) => run(() => configSetCommand(key, value)));

program.parse();

async function run(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
