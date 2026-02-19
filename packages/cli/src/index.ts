import { defineCommand, runMain } from "citty";
import { grep } from "./commands/grep.js";
import { list } from "./commands/list.js";
import { register } from "./commands/register.js";
import { remove } from "./commands/remove.js";
import { status } from "./commands/status.js";

const main = defineCommand({
  meta: {
    name: "lens",
    version: "2.0.0",
    description: "LENS — structured code query engine",
  },
  subCommands: {
    status,
    register,
    remove,
    list,
    grep,
  },
});

runMain(main);
