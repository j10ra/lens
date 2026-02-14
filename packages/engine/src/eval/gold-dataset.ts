import type { QueryKind } from "../types";

export interface GoldQuery {
  id: string;
  query: string;
  kind: QueryKind;
  expected_files: string[];
  expected_entry?: string;
  tags?: string[];
}

export const GOLD_DATASET: GoldQuery[] = [
  // --- natural (12) ---
  {
    id: "nat-01",
    query: "How does the context pack pipeline work?",
    kind: "natural",
    expected_files: [
      "packages/engine/src/context/context.ts",
      "packages/engine/src/context/formatter.ts",
      "packages/engine/src/context/query-interpreter.ts",
    ],
    expected_entry: "packages/engine/src/context/context.ts",
  },
  {
    id: "nat-02",
    query: "How does file indexing work?",
    kind: "natural",
    expected_files: [
      "packages/engine/src/index/engine.ts",
      "packages/engine/src/index/chunker.ts",
      "packages/engine/src/index/discovery.ts",
    ],
    expected_entry: "packages/engine/src/index/engine.ts",
  },
  {
    id: "nat-03",
    query: "How are imports resolved and the import graph built?",
    kind: "natural",
    expected_files: ["packages/engine/src/index/import-graph.ts", "packages/engine/src/index/imports.ts"],
    expected_entry: "packages/engine/src/index/import-graph.ts",
  },
  {
    id: "nat-04",
    query: "How does the daemon HTTP server handle requests?",
    kind: "natural",
    expected_files: ["apps/daemon/src/server.ts", "apps/daemon/src/index.ts"],
    expected_entry: "apps/daemon/src/server.ts",
  },
  {
    id: "nat-05",
    query: "How does the CLI register a repo?",
    kind: "natural",
    expected_files: ["packages/cli/src/commands/register.ts", "packages/engine/src/repo/repo.ts"],
    expected_entry: "packages/cli/src/commands/register.ts",
  },
  {
    id: "nat-06",
    query: "How does git history analysis and co-change detection work?",
    kind: "natural",
    expected_files: ["packages/engine/src/index/git-analysis.ts"],
    expected_entry: "packages/engine/src/index/git-analysis.ts",
  },
  {
    id: "nat-07",
    query: "How does the MCP stdio server work?",
    kind: "natural",
    expected_files: ["apps/daemon/src/mcp.ts"],
    expected_entry: "apps/daemon/src/mcp.ts",
  },
  {
    id: "nat-08",
    query: "How does TF-IDF scoring work in the query interpreter?",
    kind: "natural",
    expected_files: ["packages/engine/src/context/query-interpreter.ts"],
    expected_entry: "packages/engine/src/context/query-interpreter.ts",
  },
  {
    id: "nat-09",
    query: "How are file metadata (exports, docstrings, sections) extracted?",
    kind: "natural",
    expected_files: ["packages/engine/src/index/extract-metadata.ts"],
    expected_entry: "packages/engine/src/index/extract-metadata.ts",
  },
  {
    id: "nat-10",
    query: "How does vector/semantic search work?",
    kind: "natural",
    expected_files: ["packages/engine/src/context/vector.ts", "packages/engine/src/index/embed.ts"],
    expected_entry: "packages/engine/src/context/vector.ts",
  },
  {
    id: "nat-11",
    query: "How does the file watcher detect changes?",
    kind: "natural",
    expected_files: ["packages/engine/src/index/watcher.ts"],
    expected_entry: "packages/engine/src/index/watcher.ts",
  },
  {
    id: "nat-12",
    query: "How is the database schema defined?",
    kind: "natural",
    expected_files: ["packages/engine/src/db/schema.ts", "packages/engine/src/db/connection.ts"],
    expected_entry: "packages/engine/src/db/schema.ts",
  },

  // --- symbol (5) ---
  {
    id: "sym-01",
    query: "buildContext",
    kind: "symbol",
    expected_files: ["packages/engine/src/context/context.ts"],
    expected_entry: "packages/engine/src/context/context.ts",
  },
  {
    id: "sym-02",
    query: "interpretQuery",
    kind: "symbol",
    expected_files: ["packages/engine/src/context/query-interpreter.ts"],
    expected_entry: "packages/engine/src/context/query-interpreter.ts",
  },
  {
    id: "sym-03",
    query: "runIndex",
    kind: "symbol",
    expected_files: ["packages/engine/src/index/engine.ts"],
    expected_entry: "packages/engine/src/index/engine.ts",
  },
  {
    id: "sym-04",
    query: "extractFileMetadata",
    kind: "symbol",
    expected_files: ["packages/engine/src/index/extract-metadata.ts"],
    expected_entry: "packages/engine/src/index/extract-metadata.ts",
  },
  {
    id: "sym-05",
    query: "formatContextPack",
    kind: "symbol",
    expected_files: ["packages/engine/src/context/formatter.ts"],
    expected_entry: "packages/engine/src/context/formatter.ts",
  },

  // --- error_message (3) ---
  {
    id: "err-01",
    query: "Error: repo not found",
    kind: "error_message",
    expected_files: ["packages/engine/src/repo/repo.ts", "apps/daemon/src/server.ts"],
    expected_entry: "packages/engine/src/repo/repo.ts",
  },
  {
    id: "err-02",
    query: "LENS daemon is not running",
    kind: "error_message",
    expected_files: ["packages/cli/src/util/client.ts"],
    expected_entry: "packages/cli/src/util/client.ts",
  },
  {
    id: "err-03",
    query: "Context generation failed",
    kind: "error_message",
    expected_files: ["packages/engine/src/context/context.ts"],
    expected_entry: "packages/engine/src/context/context.ts",
  },
];
