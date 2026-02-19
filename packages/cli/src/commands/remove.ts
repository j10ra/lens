import { defineCommand } from "citty";
import { daemonFetch } from "../lib/daemon.js";

export const remove = defineCommand({
  meta: {
    description: "Remove a registered repo from the daemon.",
  },
  args: {
    id: {
      type: "positional",
      required: true,
      description: "Repo UUID to remove",
    },
  },
  async run({ args }) {
    try {
      await daemonFetch(`/repos/${args.id}`, { method: "DELETE" });
      console.log(`Removed repo ${args.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Repo not found") || msg.includes("404")) {
        console.error(`Repo not found: ${args.id}`);
        process.exit(1);
      }
      throw err;
    }
  },
});
