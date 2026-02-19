import { defineCommand } from "citty";
import { daemonFetch } from "../lib/daemon.js";

interface Repo {
  id: string;
  name: string;
  root_path: string;
  index_status: string;
}

export const register = defineCommand({
  meta: {
    description: "Register a repo with the daemon for indexing.",
  },
  args: {
    path: {
      type: "positional",
      required: true,
      description: "Absolute path to repo root",
    },
    name: {
      type: "string",
      alias: "n",
      description: "Human-readable name (defaults to directory name)",
    },
  },
  async run({ args }) {
    const res = await daemonFetch("/api/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: args.path, name: args.name }),
    });

    const repo = (await res.json()) as Repo;
    console.log(`Registered: ${repo.name} (${repo.id})`);
    console.log(`  path   : ${repo.root_path}`);
    console.log(`  status : ${repo.index_status}`);
  },
});
