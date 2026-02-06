#!/usr/bin/env node
import { Command } from "commander";
import { registerCommand } from "./commands/register.js";
import { taskCommand } from "./commands/task.js";
import { searchCommand } from "./commands/search.js";
import { readCommand } from "./commands/read.js";
import { indexCommand } from "./commands/index.js";
import { summaryCommand } from "./commands/summary.js";
import { mapCommand } from "./commands/map.js";
import { runCommand } from "./commands/run.js";
import { statusCommand } from "./commands/status.js";
import { listCommand } from "./commands/list.js";
import { removeCommand } from "./commands/remove.js";
import { daemonStatsCommand } from "./commands/daemon-stats.js";
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

// rlm task "<goal>"
program
  .command("task <goal>")
  .description("Build a context pack for a task")
  .option("--json", "Output as JSON", false)
  .action((goal, opts) => run(() => taskCommand(goal, opts)));

// rlm search "<query>"
program
  .command("search <query>")
  .description("Search the repo")
  .option("--json", "Output as JSON", false)
  .option("--mode <mode>", "Search mode: grep|semantic|hybrid")
  .option("--limit <n>", "Max results")
  .action((query, opts) => run(() => searchCommand(query, opts)));

// rlm index
program
  .command("index")
  .description("Index the current repo")
  .option("--json", "Output as JSON", false)
  .option("--force", "Force full re-index", false)
  .option("--status", "Show index status", false)
  .action((opts) => run(() => indexCommand(opts)));

// rlm summary [path]
program
  .command("summary [path]")
  .description("Generate or view file summaries")
  .option("--json", "Output as JSON", false)
  .action((path, opts) => run(() => summaryCommand(path, opts)));

// rlm map
program
  .command("map")
  .description("Print repo map with descriptions")
  .option("--json", "Output as JSON", false)
  .option("--depth <n>", "Max depth", "3")
  .action((opts) => run(() => mapCommand(opts)));

// rlm read <path>
program
  .command("read <path>")
  .description("Read a file from the repo")
  .option("--json", "Output as JSON", false)
  .option("--start <line>", "Start line")
  .option("--end <line>", "End line")
  .action((path, opts) => run(() => readCommand(path, opts)));

// rlm run "<command>"
program
  .command("run <command>")
  .description("Run a command in the repo (sandboxed)")
  .option("--json", "Output as JSON", false)
  .option("--timeout <ms>", "Timeout in ms")
  .action((command, opts) => run(() => runCommand(command, opts)));

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

program.parse();

async function run(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
