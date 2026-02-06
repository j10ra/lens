// POST /runner/run — sandboxed command execution
// Allowlisted executables only (npm, cargo, python, git, etc). Traces every run.

import { api, APIError } from "encore.dev/api";
import { spawn } from "node:child_process";
import { db } from "../repo/db";

const ALLOWED_EXECUTABLES = new Set([
  "npm", "npx", "pnpm", "yarn", "bun",
  "make", "cargo", "go", "python", "python3",
  "pytest", "jest", "vitest", "mocha",
  "tsc", "eslint", "prettier",
  "git",
]);

const MAX_TIMEOUT = 120_000;
const DEFAULT_TIMEOUT = 60_000;
const MAX_OUTPUT = 100_000; // 100KB

interface RunParams {
  repo_id: string;
  command: string;
  timeout_ms?: number;
}

interface RunResponse {
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  trace_id: string;
}

export const run = api(
  { expose: true, method: "POST", path: "/runner/run" },
  async (params: RunParams): Promise<RunResponse> => {
    const start = Date.now();
    const timeout = Math.min(params.timeout_ms ?? DEFAULT_TIMEOUT, MAX_TIMEOUT);

    const repo = await db.queryRow<{ root_path: string }>`
      SELECT root_path FROM repos WHERE id = ${params.repo_id}
    `;
    if (!repo) throw APIError.notFound("repo not found");

    // Parse command into [exe, ...args]
    const parts = parseCommand(params.command);
    if (parts.length === 0) throw APIError.invalidArgument("empty command");

    const exe = parts[0];
    const args = parts.slice(1);

    // Allowlist check
    if (!ALLOWED_EXECUTABLES.has(exe)) {
      throw APIError.invalidArgument(
        `executable "${exe}" not allowed. Allowed: ${[...ALLOWED_EXECUTABLES].join(", ")}`,
      );
    }

    // Execute with shell: false — no metacharacter injection
    const result = await execSafe(exe, args, repo.root_path, timeout);

    const traceRow = await db.queryRow<{ id: string }>`
      INSERT INTO traces (repo_id, task_goal, step, trace_type, input, output, status, duration_ms)
      VALUES (
        ${params.repo_id}, ${params.command}, 'run', 'run',
        ${JSON.stringify({ exe, args })}::jsonb,
        ${JSON.stringify({ exit_code: result.exit_code, stdout_len: result.stdout.length, stderr_len: result.stderr.length })}::jsonb,
        ${result.exit_code === 0 ? "success" : "failure"},
        ${result.duration_ms}
      )
      RETURNING id
    `;

    return { ...result, trace_id: traceRow?.id ?? "" };
  },
);

/** Parse a command string into [executable, ...args], respecting quotes */
function parseCommand(cmd: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuote: string | null = null;

  for (const ch of cmd) {
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === " " || ch === "\t") {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Spawn a child process with timeout and output capture */
function execSafe(
  exe: string,
  args: string[],
  cwd: string,
  timeout: number,
): Promise<{ exit_code: number; stdout: string; stderr: string; duration_ms: number }> {
  return new Promise((res) => {
    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let killed = false;

    const child = spawn(exe, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
    });

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      killed = true;
      try { process.kill(-child.pid!, "SIGKILL"); } catch {
        try { child.kill("SIGKILL"); } catch { /* ignore */ }
      }
    }, timeout);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) {
        stderr += "\n(killed: timeout exceeded)";
      }
      res({
        exit_code: code ?? 1,
        stdout: stdout.slice(0, MAX_OUTPUT),
        stderr: stderr.slice(0, MAX_OUTPUT),
        duration_ms: Date.now() - start,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      res({
        exit_code: 127,
        stdout: "",
        stderr: err.message,
        duration_ms: Date.now() - start,
      });
    });
  });
}
