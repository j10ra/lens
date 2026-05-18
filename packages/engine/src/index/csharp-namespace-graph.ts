import type { Db } from "../db/connection.js";
import { importQueries, metadataQueries } from "../db/queries.js";

export interface CsharpFile {
  path: string;
  namespaces: string[];
  imports: string[];
}

export interface ImportEdge {
  sourcePath: string;
  targetPath: string;
}

const MAX_OWNERS_PER_NAMESPACE = 5;

/**
 * Pure-function resolver. Tested in isolation.
 * Given the full list of C# files in a repo with their namespaces + usings,
 * returns the file-to-file edges that LENS's import graph should record.
 */
export function resolveCsharpEdges(files: CsharpFile[]): ImportEdge[] {
  const owners = new Map<string, string[]>();
  for (const f of files) {
    for (const ns of f.namespaces) {
      const list = owners.get(ns) ?? [];
      list.push(f.path);
      owners.set(ns, list);
    }
  }

  const seen = new Set<string>();
  const edges: ImportEdge[] = [];

  for (const f of files) {
    for (const ns of f.imports) {
      const ownerPaths = owners.get(ns);
      if (!ownerPaths || ownerPaths.length === 0) continue;
      for (const target of ownerPaths.slice(0, MAX_OWNERS_PER_NAMESPACE)) {
        if (target === f.path) continue;
        const key = `${f.path}\0${target}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ sourcePath: f.path, targetPath: target });
      }
    }
  }
  return edges;
}

/**
 * Indexing-time entry. Reads C# files' metadata, resolves edges, persists.
 * Wrapped in lensFn at the engine barrel (not required at this layer).
 */
export function buildCsharpNamespaceGraphImpl(db: Db, repoId: string): { edges: number } {
  const all = metadataQueries.getAllForRepo(db, repoId);
  const csFiles: CsharpFile[] = [];
  for (const m of all) {
    if (m.language !== "csharp") continue;
    let namespaces: string[] = [];
    let imports: string[] = [];
    try {
      namespaces = JSON.parse(m.namespaces ?? "[]");
    } catch {}
    try {
      imports = JSON.parse(m.imports ?? "[]");
    } catch {}
    csFiles.push({ path: m.path, namespaces, imports });
  }

  if (csFiles.length === 0) return { edges: 0 };

  const edges = resolveCsharpEdges(csFiles);
  if (edges.length > 0) {
    importQueries.insertEdges(db, repoId, edges);
  }
  return { edges: edges.length };
}
