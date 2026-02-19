import { defineCommand } from "citty";
import { daemonFetch } from "../lib/daemon.js";

interface EnrichedMatch {
  path: string;
  score: number;
  isHub: boolean;
  importers: string[];
}

interface GrepResult {
  repoId: string;
  terms: string[];
  results: Record<string, EnrichedMatch[]>;
}

export const grep = defineCommand({
  meta: {
    description: "Search a repo using pipe-separated query terms.",
  },
  args: {
    query: {
      type: "positional",
      required: true,
      description: "Pipe-separated query terms (e.g. 'auth|login')",
    },
    repo: {
      type: "string",
      alias: "r",
      description: "Repo root path (defaults to cwd)",
    },
    limit: {
      type: "string",
      alias: "l",
      default: "20",
      description: "Max results per term",
    },
  },
  async run({ args }) {
    const repoPath = args.repo ?? process.cwd();

    let result: GrepResult;
    try {
      const res = await daemonFetch("/grep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath, query: args.query, limit: parseInt(args.limit, 10) }),
      });
      result = (await res.json()) as GrepResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Repo not registered")) {
        console.error(`Repo not registered. Run: lens register ${repoPath}`);
        process.exit(1);
      }
      throw err;
    }

    for (const term of result.terms) {
      const matches = result.results[term] ?? [];
      console.log(`\n-- ${term} (${matches.length} results) --`);
      for (const match of matches) {
        const hubFlag = match.isHub ? " [hub]" : "";
        const importedBy = match.importers.length > 0 ? ` <- ${match.importers.slice(0, 2).join(", ")}` : "";
        console.log(`  ${match.path}${hubFlag}  score=${match.score.toFixed(2)}${importedBy}`);
      }
    }
  },
});
