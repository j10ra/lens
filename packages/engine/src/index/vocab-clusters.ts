import type { Capabilities } from "../capabilities";
import type { Db } from "../db/connection";
import { jsonParse, metadataQueries, repoQueries } from "../db/queries";
import type { VocabCluster } from "../types";

const TERM_BATCH_SIZE = 32;
const SIMILARITY_THRESHOLD = 0.75;
const MAX_TERMS = 1500;
const MAX_CLUSTERS = 200;
const MAX_CLUSTER_SIZE = 12;

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "can",
  "need",
  "must",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "and",
  "but",
  "or",
  "not",
  "no",
  "so",
  "if",
  "then",
  "than",
  "that",
  "this",
  "it",
  "its",
  "all",
  "each",
  "every",
  "any",
  "some",
  "how",
  "what",
  "which",
  "who",
  "when",
  "where",
  "why",
  "get",
  "set",
  "new",
  "null",
  "true",
  "false",
  "void",
  "type",
  "var",
  "let",
  "const",
  "return",
  "import",
  "export",
  "default",
  "class",
  "function",
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "index",
  "data",
  "value",
  "result",
  "item",
  "list",
  "name",
  "id",
  "key",
  "src",
  "lib",
  "app",
  "test",
  "spec",
  "mock",
  "model",
  "module",
  "component",
]);

function splitIdentifier(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-./\\]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

export function extractVocab(files: Array<{ path: string; exports: string[] }>): {
  terms: string[];
  termToFiles: Map<string, Set<string>>;
} {
  const termToFiles = new Map<string, Set<string>>();

  for (const f of files) {
    const pathParts = f.path.split("/");
    for (const seg of pathParts) {
      const base = seg.replace(/\.[^.]+$/, "");
      for (const word of splitIdentifier(base)) {
        const s = termToFiles.get(word) ?? new Set();
        s.add(f.path);
        termToFiles.set(word, s);
      }
    }
    for (const exp of f.exports) {
      for (const word of splitIdentifier(exp)) {
        const s = termToFiles.get(word) ?? new Set();
        s.add(f.path);
        termToFiles.set(word, s);
      }
    }
  }

  const totalFiles = files.length;
  const maxDf = Math.max(10, Math.floor(totalFiles * 0.3));
  const filtered: string[] = [];
  for (const [term, fileSet] of termToFiles) {
    if (fileSet.size >= 2 && fileSet.size <= maxDf) {
      filtered.push(term);
    }
  }

  filtered.sort((a, b) => (termToFiles.get(b)?.size ?? 0) - (termToFiles.get(a)?.size ?? 0));
  const terms = filtered.slice(0, MAX_TERMS);
  return { terms, termToFiles };
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

export function agglomerativeCluster(terms: string[], embeddings: number[][]): number[][] {
  const n = terms.length;

  const pairs: Array<{ i: number; j: number; sim: number }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = cosine(embeddings[i], embeddings[j]);
      if (sim >= SIMILARITY_THRESHOLD) pairs.push({ i, j, sim });
    }
  }
  pairs.sort((a, b) => b.sim - a.sim);

  const parent = new Int32Array(n);
  const size = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    parent[i] = i;
    size[i] = 1;
  }

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  for (const { i, j } of pairs) {
    const ri = find(i),
      rj = find(j);
    if (ri === rj) continue;
    if (size[ri] + size[rj] > MAX_CLUSTER_SIZE) continue;
    if (size[ri] >= size[rj]) {
      parent[rj] = ri;
      size[ri] += size[rj];
    } else {
      parent[ri] = rj;
      size[rj] += size[ri];
    }
  }

  const clusterMap = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = clusterMap.get(root) ?? [];
    arr.push(i);
    clusterMap.set(root, arr);
  }

  return [...clusterMap.values()].filter((c) => c.length >= 2);
}

export async function buildVocabClusters(db: Db, repoId: string, caps?: Capabilities, force = false): Promise<void> {
  if (!caps?.embedTexts) {
    console.error("[LENS] Vocab clusters: skipped (no embedTexts capability)");
    return;
  }

  const repo = repoQueries.getById(db, repoId);
  if (!repo) return;

  if (!force && repo.last_vocab_cluster_commit && repo.last_vocab_cluster_commit === repo.last_indexed_commit) {
    console.error("[LENS] Vocab clusters: skipped (unchanged since last build)");
    return;
  }

  const rows = metadataQueries.getByRepo(db, repoId).map((r) => ({
    path: r.path,
    exports: Array.isArray(r.exports) ? r.exports : jsonParse(r.exports, [] as string[]),
  }));

  if (rows.length === 0) {
    console.error("[LENS] Vocab clusters: skipped (no metadata rows)");
    return;
  }

  const { terms, termToFiles } = extractVocab(rows);
  if (terms.length < 4) {
    console.error(`[LENS] Vocab clusters: skipped (only ${terms.length} terms, need ≥4)`);
    return;
  }

  console.error(
    `[LENS] Vocab clusters: embedding ${terms.length} terms in ${Math.ceil(terms.length / TERM_BATCH_SIZE)} batches...`,
  );

  let embeddings: number[][];
  try {
    const results: number[][] = [];
    for (let i = 0; i < terms.length; i += TERM_BATCH_SIZE) {
      const batch = terms.slice(i, i + TERM_BATCH_SIZE);
      const vecs = await caps.embedTexts(batch, false);
      results.push(...vecs);
    }
    embeddings = results;
  } catch (err) {
    console.error(`[LENS] Vocab clusters: embed failed (${terms.length} terms):`, (err as Error).message);
    return;
  }

  const rawClusters = agglomerativeCluster(terms, embeddings);
  console.error(`[LENS] Vocab clusters: ${rawClusters.length} clusters from ${terms.length} terms`);

  const clusters: VocabCluster[] = rawClusters
    .map((indices) => {
      const clusterTerms = indices.map((i) => terms[i]);
      const fileSet = new Set<string>();
      for (const t of clusterTerms) {
        const files = termToFiles.get(t);
        if (files) for (const f of files) fileSet.add(f);
      }
      return { terms: clusterTerms, files: [...fileSet].sort() };
    })
    .filter((c) => c.files.length > 0)
    .sort((a, b) => b.files.length - a.files.length)
    .slice(0, MAX_CLUSTERS);

  repoQueries.updateVocabClusters(db, repoId, clusters, repo.last_indexed_commit ?? undefined);
}
