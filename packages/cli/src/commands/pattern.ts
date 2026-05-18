import { defineCommand } from "citty";
import { daemonFetch } from "../lib/daemon.js";

export const pattern = defineCommand({
  meta: {
    description: "Structural AST search via ast-grep pattern.",
  },
  args: {
    pattern: {
      type: "positional",
      required: true,
      description: 'ast-grep pattern, e.g. "function $N($$$) { $$$ }"',
    },
    lang: {
      type: "string",
      alias: "l",
      default: "typescript",
      description: "Source language: typescript | tsx | javascript | csharp",
    },
    repo: {
      type: "string",
      alias: "r",
      description: "Repo root path (defaults to cwd)",
    },
    limit: {
      type: "string",
      default: "50",
      description: "Max matches",
    },
    json: {
      type: "boolean",
      description: "Output full JSON instead of compact text",
    },
  },
  async run({ args }) {
    const repoPath = args.repo ?? process.cwd();
    const format = args.json ? "json" : "text";

    const res = await daemonFetch("/pattern", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repoPath,
        pattern: args.pattern,
        language: args.lang,
        limit: parseInt(args.limit, 10),
        format,
      }),
    });

    if (format === "json") {
      console.log(JSON.stringify(await res.json(), null, 2));
    } else {
      process.stdout.write(await res.text());
    }
  },
});
