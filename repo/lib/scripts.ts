import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface RepoScripts {
  test?: string;
  build?: string;
  lint?: string;
}

/** Auto-detect test/build/lint commands from project config files.
 *  Per-field fill — continues scanning until all 3 fields populated. */
export async function detectScripts(rootPath: string): Promise<RepoScripts> {
  const scripts: RepoScripts = {};

  // package.json
  await tryParse(resolve(rootPath, "package.json"), (raw) => {
    const pkg = JSON.parse(raw);
    const s = pkg.scripts ?? {};
    if (!scripts.test && s.test) scripts.test = `npm test`;
    if (!scripts.build && s.build) scripts.build = `npm run build`;
    if (!scripts.lint && s.lint) scripts.lint = `npm run lint`;
  });

  if (allFilled(scripts)) return scripts;

  // Makefile — extract common targets
  await tryParse(resolve(rootPath, "Makefile"), (raw) => {
    const targets = new Set(raw.match(/^([a-z_-]+):/gm)?.map((t) => t.replace(":", "")) ?? []);
    if (!scripts.test && targets.has("test")) scripts.test = "make test";
    if (!scripts.build && targets.has("build")) scripts.build = "make build";
    if (!scripts.lint && (targets.has("lint") || targets.has("check"))) {
      scripts.lint = targets.has("lint") ? "make lint" : "make check";
    }
  });

  if (allFilled(scripts)) return scripts;

  // Cargo.toml
  await tryParse(resolve(rootPath, "Cargo.toml"), () => {
    if (!scripts.test) scripts.test = "cargo test";
    if (!scripts.build) scripts.build = "cargo build";
    if (!scripts.lint) scripts.lint = "cargo clippy";
  });

  if (allFilled(scripts)) return scripts;

  // pyproject.toml
  await tryParse(resolve(rootPath, "pyproject.toml"), (raw) => {
    if (!scripts.test) {
      scripts.test = raw.includes("pytest") ? "pytest" : "python -m pytest";
    }
    if (!scripts.build) scripts.build = "python -m build";
    if (!scripts.lint && raw.includes("ruff")) scripts.lint = "ruff check .";
  });

  return scripts;
}

function allFilled(s: RepoScripts): boolean {
  return !!(s.test && s.build && s.lint);
}

async function tryParse(path: string, fn: (raw: string) => void): Promise<void> {
  try {
    const raw = await readFile(path, "utf-8");
    fn(raw);
  } catch {
    // File not found — skip
  }
}
