import { db } from "../../repo/db";

interface MapEntry {
  path: string;
  level: string;
  summary: string;
}

export interface RepoMapOptions {
  maxDepth?: number;
}

export async function generateRepoMap(
  repoId: string,
  opts: RepoMapOptions = {},
): Promise<string> {
  const maxDepth = opts.maxDepth ?? 3;

  // Fetch all current summaries for this repo
  const rows: MapEntry[] = [];
  const cursor = db.query<MapEntry>`
    SELECT DISTINCT ON (path, level) path, level, summary
    FROM summaries
    WHERE repo_id = ${repoId}
    ORDER BY path, level, updated_at DESC
  `;
  for await (const row of cursor) {
    rows.push(row);
  }

  if (rows.length === 0) return "(no summaries available — run `rlm summary` first)";

  // Build tree structure
  const tree = buildTree(rows, maxDepth);
  return renderTree(tree, 0);
}

interface TreeNode {
  name: string;
  summary: string;
  level: string;
  children: TreeNode[];
}

function buildTree(entries: MapEntry[], maxDepth: number): TreeNode[] {
  const root: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  // Sort by path for deterministic output
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));

  for (const entry of sorted) {
    const parts = entry.path.split("/");
    if (parts.length > maxDepth) continue;

    const node: TreeNode = {
      name: parts[parts.length - 1],
      summary: entry.summary,
      level: entry.level,
      children: [],
    };

    nodeMap.set(entry.path, node);

    // Find parent
    const parentPath = parts.slice(0, -1).join("/");
    if (parentPath && nodeMap.has(parentPath)) {
      nodeMap.get(parentPath)!.children.push(node);
    } else {
      root.push(node);
    }
  }

  return root;
}

function renderTree(nodes: TreeNode[], indent: number): string {
  const lines: string[] = [];
  const pad = "  ".repeat(indent);

  for (const node of nodes) {
    const suffix = node.level === "directory" ? "/" : "";
    const desc = node.summary ? ` — ${truncate(node.summary, 50)}` : "";
    lines.push(`${pad}${node.name}${suffix}${desc}`);

    if (node.children.length > 0) {
      lines.push(renderTree(node.children, indent + 1));
    }
  }

  return lines.join("\n");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}
