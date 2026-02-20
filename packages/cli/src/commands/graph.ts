import { defineCommand } from "citty";
import { daemonFetch } from "../lib/daemon.js";

interface GraphCluster {
  key: string;
  fileCount: number;
}

interface GraphClusterEdge {
  source: string;
  target: string;
  weight: number;
}

interface GraphSummary {
  clusters: GraphCluster[];
  edges: GraphClusterEdge[];
}

interface GraphFileNode {
  path: string;
  language: string | null;
  hubScore: number;
  isHub: boolean;
  exports: string[];
}

interface GraphDetail {
  files: GraphFileNode[];
  edges: { source: string; target: string }[];
  cochanges: { source: string; target: string; weight: number }[];
}

export const graph = defineCommand({
  meta: {
    description: "Show dependency graph for a repo.",
  },
  args: {
    dir: {
      type: "positional",
      required: false,
      description: "Directory to drill into (omit for cluster summary)",
    },
    repo: {
      type: "string",
      alias: "r",
      description: "Repo root path (defaults to cwd)",
    },
    json: {
      type: "boolean",
      alias: "j",
      default: false,
      description: "Output raw JSON",
    },
  },
  async run({ args }) {
    const repoPath = args.repo ?? process.cwd();

    let result: GraphSummary | GraphDetail;
    try {
      const res = await daemonFetch("/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath, dir: args.dir || undefined }),
      });
      result = await res.json();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not registered")) {
        console.error(`Repo not registered. Run: lens register ${repoPath}`);
        process.exit(1);
      }
      throw err;
    }

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (!args.dir) {
      const summary = result as GraphSummary;
      console.log(`\n${summary.clusters.length} clusters, ${summary.edges.length} cross-cluster edges\n`);
      for (const c of summary.clusters.sort((a, b) => b.fileCount - a.fileCount)) {
        console.log(`  ${c.key.padEnd(30)} ${String(c.fileCount).padStart(4)} files`);
      }
    } else {
      const detail = result as GraphDetail;
      console.log(
        `\n${detail.files.length} files, ${detail.edges.length} edges, ${detail.cochanges.length} cochanges\n`,
      );
      for (const f of detail.files.sort((a, b) => b.hubScore - a.hubScore)) {
        const hub = f.isHub ? " [hub]" : "";
        console.log(`  ${f.path}${hub}  score=${f.hubScore.toFixed(2)}`);
      }
    }
  },
});
