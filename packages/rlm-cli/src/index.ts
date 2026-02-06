#!/usr/bin/env node
import { Command } from "commander";
import { registerCommand } from "./commands/register.js";
import { taskCommand } from "./commands/task.js";
import { searchCommand } from "./commands/search.js";
import { readCommand } from "./commands/read.js";
import { error } from "./util/format.js";

const program = new Command()
  .name("rlm")
  .description("RLM — Local Repo Language Model Daemon CLI")
  .version("0.1.0");

// rlm repo register
const repo = program.command("repo").description("Repo management");
repo
  .command("register")
  .description("Register current repo with the daemon")
  .option("--json", "Output as JSON", false)
  .action((opts) => run(() => registerCommand(opts)));

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

// rlm read <path> [start] [end]
program
  .command("read <path>")
  .description("Read a file from the repo")
  .option("--json", "Output as JSON", false)
  .option("--start <line>", "Start line")
  .option("--end <line>", "End line")
  .action((path, opts) => run(() => readCommand(path, opts)));

program.parse();

async function run(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
