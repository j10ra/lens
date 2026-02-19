import { defineCommand } from "citty";
import { DAEMON_URL, daemonFetch } from "../lib/daemon.js";

export const status = defineCommand({
  meta: {
    description: "Show daemon status. Exits 0 if running, 1 if not reachable.",
  },
  async run() {
    const res = await daemonFetch("/health");
    const data = (await res.json()) as { status: string; uptime: number; version: string };
    console.log(`lens daemon ${data.version}`);
    console.log(`  status : ${data.status}`);
    console.log(`  uptime : ${data.uptime}s`);
    console.log(`  url    : ${DAEMON_URL}`);
  },
});
