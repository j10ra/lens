import { defineCommand, runMain } from "citty";
import { daemon } from "./commands/daemon.js";
import { dashboard } from "./commands/dashboard.js";
import { graph } from "./commands/graph.js";
import { grep } from "./commands/grep.js";
import { list } from "./commands/list.js";
import { pattern } from "./commands/pattern.js";
import { register } from "./commands/register.js";
import { remove } from "./commands/remove.js";
import { status } from "./commands/status.js";

const VERSION = "2.1.1";

const main = defineCommand({
  meta: {
    name: "lens",
    version: VERSION,
    description: "LENS — structured code query engine",
  },
  args: {
    version: {
      type: "boolean",
      alias: "v",
      description: "Show version and exit",
    },
  },
  run({ args }) {
    if (args.version) {
      console.log(VERSION);
    }
  },
  subCommands: {
    daemon,
    dashboard,
    status,
    register,
    remove,
    list,
    grep,
    graph,
    pattern,
  },
});

runMain(main);
