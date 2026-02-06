import { api, APIError } from "encore.dev/api";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../repo/db";
import { writeTrace } from "../repo/trace-writer";

interface ReadParams {
  repo_id: string;
  path: string;
  start?: number;
  end?: number;
}

interface ReadResponse {
  path: string;
  content: string;
  start_line: number;
  end_line: number;
  total_lines: number;
}

export const read = api(
  { expose: true, method: "POST", path: "/read" },
  async (params: ReadParams): Promise<ReadResponse> => {
    const t0 = Date.now();

    // Look up repo root
    const repo = await db.queryRow<{ root_path: string }>`
      SELECT root_path FROM repos WHERE id = ${params.repo_id}
    `;
    if (!repo) throw APIError.notFound("repo not found");

    // Prevent path traversal
    const filePath = resolve(repo.root_path, params.path);
    if (!filePath.startsWith(repo.root_path)) {
      throw APIError.invalidArgument("path traversal not allowed");
    }

    let raw: string;
    try {
      raw = await readFile(filePath, "utf-8");
    } catch {
      throw APIError.notFound(`file not found: ${params.path}`);
    }

    const allLines = raw.split("\n");
    const total = allLines.length;
    const start = Math.max(1, params.start ?? 1);
    const end = Math.min(total, params.end ?? total);

    const content = allLines.slice(start - 1, end).join("\n");

    writeTrace({
      repo_id: params.repo_id,
      task_goal: params.path,
      step: "read",
      trace_type: "read",
      input: { path: params.path, start, end },
      output: { total_lines: total, lines_returned: end - start + 1 },
      status: "success",
      duration_ms: Date.now() - t0,
    });

    return {
      path: params.path,
      content,
      start_line: start,
      end_line: end,
      total_lines: total,
    };
  },
);
