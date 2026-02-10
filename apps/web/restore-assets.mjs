import { cpSync, existsSync, readdirSync, rmSync, mkdirSync } from "node:fs";

const backup = ".client-assets";
const target = "dist/assets";

console.log(`[restore-assets] cwd: ${process.cwd()}`);
console.log(`[restore-assets] backup exists: ${existsSync(backup)}`);

if (existsSync(backup)) {
  const files = readdirSync(backup);
  console.log(`[restore-assets] backup contains: ${files.join(", ")}`);
  mkdirSync(target, { recursive: true });
  cpSync(backup, target, { recursive: true });
  rmSync(backup, { recursive: true });
  const restored = readdirSync(target);
  console.log(`[restore-assets] restored ${restored.length} files to ${target}`);
} else {
  console.error("[restore-assets] ERROR: .client-assets not found!");
  process.exit(1);
}
