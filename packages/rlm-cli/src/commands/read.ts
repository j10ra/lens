import { ensureRepo } from "../util/ensure-repo.js";
import { post } from "../util/client.js";
import { output } from "../util/format.js";

interface ReadResponse {
  path: string;
  content: string;
  start_line: number;
  end_line: number;
  total_lines: number;
}

export async function readCommand(
  path: string,
  opts: { json: boolean; start?: string; end?: string },
): Promise<void> {
  const { repo_id } = await ensureRepo();
  const res = await post<ReadResponse>("/read", {
    repo_id,
    path,
    start: opts.start ? parseInt(opts.start, 10) : undefined,
    end: opts.end ? parseInt(opts.end, 10) : undefined,
  });

  if (opts.json) {
    output(res, true);
    return;
  }

  // Format with line numbers
  const lines = res.content.split("\n");
  const startLine = res.start_line;
  const numbered = lines.map((line, i) => {
    const num = String(startLine + i).padStart(4, " ");
    return `${num} | ${line}`;
  });

  output(`## ${res.path} (lines ${res.start_line}-${res.end_line} of ${res.total_lines})\n\`\`\`\n${numbered.join("\n")}\n\`\`\``, false);
}
