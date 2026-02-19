import { defineCommand, runMain } from "citty";

const DAEMON_URL = "http://localhost:4111";

const status = defineCommand({
  meta: {
    description: "Show daemon status. Exits 0 if running, 1 if not reachable.",
  },
  async run() {
    try {
      const res = await fetch(`${DAEMON_URL}/health`);
      if (!res.ok) {
        console.error(`Daemon returned HTTP ${res.status}`);
        process.exit(1);
      }
      const data = (await res.json()) as { status: string; uptime: number; version: string };
      console.log(`lens daemon ${data.version}`);
      console.log(`  status : ${data.status}`);
      console.log(`  uptime : ${data.uptime}s`);
      console.log(`  url    : ${DAEMON_URL}`);
    } catch {
      // fetch throws on connection refused — daemon not running
      console.error("lens daemon is not running. Start it with: lens daemon start");
      process.exit(1);
    }
  },
});

const main = defineCommand({
  meta: {
    name: "lens",
    version: "2.0.0",
    description: "LENS — structured code query engine",
  },
  subCommands: {
    status,
  },
});

runMain(main);
