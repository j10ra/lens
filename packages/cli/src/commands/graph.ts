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
  commits: number;
  recent90d: number;
}

interface GraphDetail {
  files: GraphFileNode[];
  edges: { source: string; target: string }[];
  cochanges: { source: string; target: string; weight: number }[];
}

interface FileNeighborhood {
  file: GraphFileNode & { symbols: { name: string; kind: string; line: number; exported: boolean }[] };
  imports: string[];
  importers: string[];
  cochanges: { path: string; weight: number }[];
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
    file: {
      type: "string",
      alias: "f",
      description: "File path for neighborhood detail (e.g. packages/engine/src/index.ts)",
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

    // File neighborhood mode
    if (args.file) {
      let result: FileNeighborhood;
      try {
        const res = await daemonFetch("/graph/neighbors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoPath, path: args.file }),
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

      const f = result.file;
      const hub = f.isHub ? " [hub]" : "";
      console.log(`\n${f.path}${hub}  score=${f.hubScore.toFixed(2)}  lang=${f.language ?? "?"}`);
      console.log(`  commits=${f.commits ?? 0}  exports=${f.exports.length}  symbols=${f.symbols.length}`);

      if (result.imports.length > 0) {
        console.log(`\n  Imports (${result.imports.length}):`);
        for (const p of result.imports) console.log(`    → ${p}`);
      }
      if (result.importers.length > 0) {
        console.log(`\n  Imported by (${result.importers.length}):`);
        for (const p of result.importers) console.log(`    ← ${p}`);
      }
      if (result.cochanges.length > 0) {
        console.log(`\n  Co-changes (${result.cochanges.length}):`);
        for (const c of result.cochanges) console.log(`    ~ ${c.path}  ×${c.weight}`);
      }
      return;
    }

    // Existing graph modes
    let graphResult: GraphSummary | GraphDetail;
    try {
      const res = await daemonFetch("/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath, dir: args.dir || undefined }),
      });
      graphResult = await res.json();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not registered")) {
        console.error(`Repo not registered. Run: lens register ${repoPath}`);
        process.exit(1);
      }
      throw err;
    }

    if (args.json) {
      console.log(JSON.stringify(graphResult, null, 2));
      return;
    }

    if (!args.dir) {
      const summary = graphResult as GraphSummary;
      console.log(`\n${summary.clusters.length} clusters, ${summary.edges.length} cross-cluster edges\n`);
      for (const c of summary.clusters.sort((a, b) => b.fileCount - a.fileCount)) {
        console.log(`  ${c.key.padEnd(30)} ${String(c.fileCount).padStart(4)} files`);
      }
    } else {
      const detail = graphResult as GraphDetail;
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
