import { get } from "../util/client.js";
import { output } from "../util/format.js";

interface RepoDetail {
  id: string;
  name: string;
  root_path: string;
  index_status: string;
  chunk_count: number;
  files_indexed: number;
  embedded_pct: number;
  last_indexed_at: string | null;
}

interface ListDetailedResponse {
  repos: RepoDetail[];
}

export async function listCommand(opts: { json: boolean }): Promise<void> {
  const res = await get<ListDetailedResponse>("/repo/list/detailed");

  if (opts.json) {
    output(res, true);
    return;
  }

  if (res.repos.length === 0) {
    output("No repos registered. Run `rlm repo register` to add one.", false);
    return;
  }

  // Table header
  const header = pad("ID", 10) + pad("Name", 20) + pad("Status", 10) + pad("Files", 8) + pad("Chunks", 10) + pad("Embed%", 8) + "Last Indexed";
  const sep = "-".repeat(header.length);

  const lines = [header, sep];
  for (const r of res.repos) {
    const id = r.id.slice(0, 8);
    const indexed = r.last_indexed_at ? timeAgo(r.last_indexed_at) : "never";
    lines.push(
      pad(id, 10) +
      pad(r.name, 20) +
      pad(r.index_status, 10) +
      pad(String(r.files_indexed), 8) +
      pad(r.chunk_count.toLocaleString(), 10) +
      pad(`${r.embedded_pct}%`, 8) +
      indexed,
    );
  }

  output(lines.join("\n"), false);
}

function pad(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width - 1) + " " : s + " ".repeat(width - s.length);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
