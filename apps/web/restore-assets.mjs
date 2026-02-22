import { cpSync, existsSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";

const backup = ".client-assets";
const target = "dist/assets";

if (existsSync(backup)) {
  mkdirSync(target, { recursive: true });
  cpSync(backup, target, { recursive: true });
  rmSync(backup, { recursive: true });
  const restored = readdirSync(target);
  console.log(`[restore-assets] restored ${restored.length} files to dist/assets`);
} else {
  console.error("[restore-assets] ERROR: .client-assets not found!");
  process.exit(1);
}

const routesPath = "dist/_routes.json";
if (existsSync(routesPath)) {
  const routes = JSON.parse(readFileSync(routesPath, "utf8"));
  routes.exclude = ["/assets/*"];
  writeFileSync(routesPath, JSON.stringify(routes, null, 2));
  console.log("[restore-assets] patched _routes.json — exclude: /assets/*");
}
