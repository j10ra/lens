import { defineCommand } from "citty";
import { daemonFetch } from "../lib/daemon.js";

interface Repo {
  id: string;
  name: string;
  root_path: string;
  index_status: string;
  last_indexed_at: string | null;
}

const STATUS_ICONS: Record<string, string> = {
  ready: "✓",
  indexing: "...",
  pending: "○",
  error: "✗",
};

export const list = defineCommand({
  meta: {
    description: "List all registered repos.",
  },
  async run() {
    const res = await daemonFetch("/repos");
    const repos = (await res.json()) as Repo[];

    if (repos.length === 0) {
      console.log("No repos registered. Use: lens register <path>");
      return;
    }

    for (const repo of repos) {
      const icon = STATUS_ICONS[repo.index_status] ?? "?";
      console.log(`${icon} ${repo.name}`);
      console.log(`  id     : ${repo.id}`);
      console.log(`  path   : ${repo.root_path}`);
      console.log(`  status : ${repo.index_status}`);
      console.log(`  indexed: ${repo.last_indexed_at ?? "never"}`);
      console.log();
    }
  },
});
