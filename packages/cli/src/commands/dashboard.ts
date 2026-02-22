import { exec } from "node:child_process";
import { defineCommand } from "citty";

const DASHBOARD_URL = "http://localhost:4111";

export const dashboard = defineCommand({
  meta: {
    description: "Open the LENS dashboard in your browser.",
  },
  async run() {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";

    exec(`${cmd} ${DASHBOARD_URL}`);
    console.log(`Opening ${DASHBOARD_URL}`);
  },
});
