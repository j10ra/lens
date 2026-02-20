# 3D Code Explorer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a galaxy-style 3D code visualization with command palette search, accessible via dashboard, CLI, and MCP.

**Architecture:** New `/graph` daemon endpoint serves cluster-level and file-level graph data built from existing DB queries. Dashboard renders via React Three Fiber with d3-force-3d layout. Same endpoint exposed as `lens_graph` MCP tool and `lens graph` CLI command.

**Tech Stack:** React Three Fiber, @react-three/drei, @react-three/postprocessing, three, d3-force-3d, existing Hono/lensFn/lensRoute patterns.

---

## Task 1: Add bulk graph queries to engine

**Files:**
- Modify: `packages/engine/src/db/queries.ts`

**Step 1: Add `graphQueries` module**

Add after `cochangeQueries` at the bottom of the file:

```typescript
// ── Graph queries ────────────────────────────────────────────────────────────

export const graphQueries = {
  /** All import edges for a repo: [{source, target}] */
  allImportEdges(db: Db, repoId: string): { source: string; target: string }[] {
    return db
      .select({ source: fileImports.source_path, target: fileImports.target_path })
      .from(fileImports)
      .where(eq(fileImports.repo_id, repoId))
      .all();
  },

  /** All cochange pairs for a repo: [{pathA, pathB, count}] */
  allCochanges(db: Db, repoId: string): { path_a: string; path_b: string; cochange_count: number }[] {
    return db
      .select({
        path_a: fileCochanges.path_a,
        path_b: fileCochanges.path_b,
        cochange_count: fileCochanges.cochange_count,
      })
      .from(fileCochanges)
      .where(eq(fileCochanges.repo_id, repoId))
      .all();
  },

  /** All file stats for a repo */
  allFileStats(db: Db, repoId: string) {
    return db
      .select({
        path: fileStats.path,
        commit_count: fileStats.commit_count,
        recent_count: fileStats.recent_count,
      })
      .from(fileStats)
      .where(eq(fileStats.repo_id, repoId))
      .all();
  },
};
```

**Step 2: Export graphQueries from engine**

In `packages/engine/src/index.ts`, update the query exports line:

```typescript
export { aggregateQueries, cochangeQueries, graphQueries, importQueries, metadataQueries, statsQueries } from "./db/queries.js";
```

**Step 3: Build and type-check**

Run: `pnpm --filter @lens/engine build`
Expected: Build succeeds, `graphQueries` available in dist.

**Step 4: Commit**

```
feat(engine): add bulk graph queries for import edges, cochanges, file stats
```

---

## Task 2: Create graph engine function

**Files:**
- Create: `packages/engine/src/graph/graph.ts`
- Modify: `packages/engine/src/index.ts`

**Step 1: Create graph.ts**

Create `packages/engine/src/graph/graph.ts`:

```typescript
import type { Db } from "../db/connection.js";
import { graphQueries, metadataQueries } from "../db/queries.js";
import { getIndegrees } from "../grep/structural.js";

const HUB_THRESHOLD = 5;

export interface GraphCluster {
  dir: string;
  fileCount: number;
  languages: Record<string, number>;
}

export interface GraphClusterEdge {
  source: string;
  target: string;
  count: number;
}

export interface GraphSummary {
  clusters: GraphCluster[];
  edges: GraphClusterEdge[];
}

export interface GraphFileNode {
  path: string;
  language: string | null;
  hubScore: number;
  isHub: boolean;
  exports: string[];
  commits: number;
  recent90d: number;
}

export interface GraphFileEdge {
  source: string;
  target: string;
}

export interface GraphCochange {
  a: string;
  b: string;
  count: number;
}

export interface GraphDetail {
  files: GraphFileNode[];
  edges: GraphFileEdge[];
  cochanges: GraphCochange[];
}

/** Derive directory cluster from a file path (first 2 segments) */
function clusterKey(path: string): string {
  const parts = path.split("/");
  return parts.length <= 2 ? parts[0] : `${parts[0]}/${parts[1]}`;
}

/** Summary mode: directory clusters + inter-cluster edges */
export function buildGraphSummary(db: Db, repoId: string): GraphSummary {
  const allFiles = metadataQueries.getAllForRepo(db, repoId);
  const allEdges = graphQueries.allImportEdges(db, repoId);

  // Build clusters
  const clusterMap = new Map<string, { fileCount: number; languages: Record<string, number> }>();
  for (const f of allFiles) {
    const key = clusterKey(f.path);
    const c = clusterMap.get(key) ?? { fileCount: 0, languages: {} };
    c.fileCount++;
    if (f.language) c.languages[f.language] = (c.languages[f.language] ?? 0) + 1;
    clusterMap.set(key, c);
  }

  const clusters: GraphCluster[] = [];
  for (const [dir, data] of clusterMap) {
    clusters.push({ dir, ...data });
  }

  // Build inter-cluster edges
  const edgeMap = new Map<string, number>();
  for (const e of allEdges) {
    const sc = clusterKey(e.source);
    const tc = clusterKey(e.target);
    if (sc === tc) continue; // skip intra-cluster
    const key = sc < tc ? `${sc}|${tc}` : `${tc}|${sc}`;
    edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
  }

  const edges: GraphClusterEdge[] = [];
  for (const [key, count] of edgeMap) {
    const [source, target] = key.split("|");
    edges.push({ source, target, count });
  }

  return { clusters, edges };
}

/** Directory mode: files + edges within a specific directory prefix */
export function buildGraphDetail(db: Db, repoId: string, dir: string): GraphDetail {
  const allFiles = metadataQueries.getAllForRepo(db, repoId);
  const dirFiles = allFiles.filter((f) => f.path.startsWith(dir));
  const dirPaths = new Set(dirFiles.map((f) => f.path));

  const allEdges = graphQueries.allImportEdges(db, repoId);
  const allCochanges = graphQueries.allCochanges(db, repoId);
  const allStats = graphQueries.allFileStats(db, repoId);
  const indegrees = getIndegrees(db, repoId);

  const statsMap = new Map(allStats.map((s) => [s.path, s]));
  const maxIndegree = Math.max(1, ...indegrees.values());

  const files: GraphFileNode[] = dirFiles.map((f) => {
    const deg = indegrees.get(f.path) ?? 0;
    const stats = statsMap.get(f.path);
    return {
      path: f.path,
      language: f.language,
      hubScore: deg / maxIndegree,
      isHub: deg >= HUB_THRESHOLD,
      exports: JSON.parse(f.exports ?? "[]"),
      commits: stats?.commit_count ?? 0,
      recent90d: stats?.recent_count ?? 0,
    };
  });

  // Edges where at least one endpoint is in this directory
  const edges: GraphFileEdge[] = allEdges
    .filter((e) => dirPaths.has(e.source) || dirPaths.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  // Cochanges where at least one endpoint is in this directory
  const cochanges: GraphCochange[] = allCochanges
    .filter((c) => dirPaths.has(c.path_a) || dirPaths.has(c.path_b))
    .map((c) => ({ a: c.path_a, b: c.path_b, count: c.cochange_count }));

  return { files, edges, cochanges };
}
```

**Step 2: Export from engine index**

In `packages/engine/src/index.ts`, add:

```typescript
import { buildGraphDetail as _buildGraphDetail, buildGraphSummary as _buildGraphSummary } from "./graph/graph.js";

export const buildGraphSummary = lensFn("engine.buildGraphSummary", async (db: Db, repoId: string) =>
  _buildGraphSummary(db, repoId),
);

export const buildGraphDetail = lensFn(
  "engine.buildGraphDetail",
  async (db: Db, repoId: string, dir: string) => _buildGraphDetail(db, repoId, dir),
);

export type { GraphCluster, GraphClusterEdge, GraphCochange, GraphDetail, GraphFileEdge, GraphFileNode, GraphSummary } from "./graph/graph.js";
```

**Step 3: Build and type-check**

Run: `pnpm --filter @lens/engine build`

**Step 4: Commit**

```
feat(engine): graph builder — cluster summary and directory detail modes
```

---

## Task 3: Create graph daemon route

**Files:**
- Create: `apps/daemon/src/routes/graph.ts`
- Modify: `apps/daemon/src/http.ts`

**Step 1: Create graph route**

Create `apps/daemon/src/routes/graph.ts`:

```typescript
import { lensRoute } from "@lens/core";
import { buildGraphDetail, buildGraphSummary, getEngineDb, listRepos } from "@lens/engine";
import { Hono } from "hono";

export const graphRoutes = new Hono();

graphRoutes.post(
  "/",
  lensRoute("graph.post", async (c) => {
    const { repoPath, dir } = await c.req.json();

    const db = getEngineDb();
    const repos = await listRepos(db);
    const repo = repos.find((r) => r.root_path === repoPath || r.root_path === repoPath?.replace(/\/$/, ""));

    if (!repo) {
      return c.json({ error: "Repo not registered", hint: 'Register with: lens register <path>' }, 404);
    }

    if (dir) {
      const detail = await buildGraphDetail(db, repo.id, dir);
      return c.json(detail);
    }

    const summary = await buildGraphSummary(db, repo.id);
    return c.json(summary);
  }),
);
```

**Step 2: Mount in http.ts**

In `apps/daemon/src/http.ts`, add import:

```typescript
import { graphRoutes } from "./routes/graph.js";
```

In `mountRoutes()`, add:

```typescript
router.route("/graph", graphRoutes);
```

**Step 3: Build and test**

Run: `pnpm --filter @lens/daemon build`

Test summary mode:
```bash
curl -s -X POST http://localhost:4111/api/dashboard/graph \
  -H 'Content-Type: application/json' \
  -d '{"repoPath":"/Volumes/Drive/__x/RLM"}' | python3 -m json.tool | head -30
```

Test directory mode:
```bash
curl -s -X POST http://localhost:4111/api/dashboard/graph \
  -H 'Content-Type: application/json' \
  -d '{"repoPath":"/Volumes/Drive/__x/RLM","dir":"packages/engine"}' | python3 -m json.tool | head -30
```

**Step 4: Commit**

```
feat(daemon): POST /graph endpoint — cluster summary and directory detail
```

---

## Task 4: Add lens_graph MCP tool

**Files:**
- Modify: `apps/daemon/src/mcp.ts`

**Step 1: Register lens_graph tool**

In `registerTools()` function, after the `lens_reindex` tool registration, add:

```typescript
server.registerTool(
  "lens_graph",
  {
    title: "LENS Graph",
    description:
      "Get the dependency graph of a codebase. Without dir: returns directory clusters and inter-cluster import edges. With dir: returns individual files, import edges, and co-change pairs within that directory.",
    inputSchema: {
      repoPath: z.string().describe("Absolute path to the repository root"),
      dir: z
        .string()
        .optional()
        .describe("Directory prefix to drill into (e.g. 'packages/engine/src'). Omit for cluster-level summary."),
    },
  },
  async ({ repoPath, dir }) => {
    const res = await fetch(`${API}/graph`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoPath, dir }),
    });
    const data = await res.json();
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  },
);
```

**Step 2: Build**

Run: `pnpm --filter @lens/daemon build`

**Step 3: Commit**

```
feat(mcp): lens_graph tool — cluster summary and directory detail
```

---

## Task 5: Add lens graph CLI command

**Files:**
- Create: `packages/cli/src/commands/graph.ts`
- Modify: `packages/cli/src/index.ts`

**Step 1: Create graph command**

Create `packages/cli/src/commands/graph.ts`:

```typescript
import { defineCommand } from "citty";
import { daemonFetch } from "../lib/daemon.js";

interface GraphCluster {
  dir: string;
  fileCount: number;
  languages: Record<string, number>;
}

interface GraphClusterEdge {
  source: string;
  target: string;
  count: number;
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
  cochanges: { a: string; b: string; count: number }[];
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

    const res = await daemonFetch("/graph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoPath, dir: args.dir || undefined }),
    });

    const data = await res.json();

    if (args.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (!args.dir) {
      // Summary mode
      const summary = data as GraphSummary;
      console.log(`\n${summary.clusters.length} clusters, ${summary.edges.length} cross-cluster edges\n`);
      for (const c of summary.clusters.sort((a, b) => b.fileCount - a.fileCount)) {
        const langs = Object.entries(c.languages)
          .sort((a, b) => b[1] - a[1])
          .map(([l, n]) => `${l}:${n}`)
          .join(" ");
        console.log(`  ${c.dir.padEnd(30)} ${String(c.fileCount).padStart(4)} files  ${langs}`);
      }
    } else {
      // Detail mode
      const detail = data as GraphDetail;
      console.log(`\n${detail.files.length} files, ${detail.edges.length} edges, ${detail.cochanges.length} cochanges\n`);
      for (const f of detail.files.sort((a, b) => b.hubScore - a.hubScore)) {
        const hub = f.isHub ? " [hub]" : "";
        console.log(`  ${f.path}${hub}  score=${f.hubScore.toFixed(2)}`);
      }
    }
  },
});
```

**Step 2: Register in CLI index**

In `packages/cli/src/index.ts`, add import and subCommand:

```typescript
import { graph } from "./commands/graph.js";
```

Add `graph` to `subCommands`:

```typescript
subCommands: {
  daemon,
  status,
  register,
  remove,
  list,
  grep,
  graph,
},
```

**Step 3: Build and test**

Run: `pnpm --filter @lens/cli build`

Test:
```bash
lens graph                              # summary mode
lens graph packages/engine/src          # detail mode
lens graph --json                       # raw JSON
```

**Step 4: Commit**

```
feat(cli): lens graph command — cluster summary and directory detail
```

---

## Task 6: Install 3D dependencies in dashboard

**Files:**
- Modify: `apps/dashboard/package.json`

**Step 1: Install packages**

```bash
pnpm --filter @lens/dashboard add three @react-three/fiber @react-three/drei @react-three/postprocessing d3-force-3d
pnpm --filter @lens/dashboard add -D @types/three @types/d3-force-3d
```

Note: `d3-force-3d` may not have types. If `@types/d3-force-3d` doesn't exist, skip it and add a `.d.ts` declaration later.

**Step 2: Verify build**

Run: `pnpm --filter @lens/dashboard build`

**Step 3: Commit**

```
chore(dashboard): add R3F, drei, postprocessing, three, d3-force-3d
```

---

## Task 7: Create graph layout utility

**Files:**
- Create: `apps/dashboard/src/lib/graph-layout.ts`
- Create: `apps/dashboard/src/lib/language-colors.ts`

**Step 1: Create language color map**

Create `apps/dashboard/src/lib/language-colors.ts`:

```typescript
const LANG_COLORS: Record<string, string> = {
  typescript: "#3178c6",
  javascript: "#f7df1e",
  json: "#a5a5a5",
  markdown: "#6b7280",
  css: "#9333ea",
  html: "#ef4444",
  shell: "#4ade80",
  yaml: "#f59e0b",
  sql: "#06b6d4",
};

const DEFAULT_COLOR = "#6b7280";

export function languageColor(lang: string | null): string {
  if (!lang) return DEFAULT_COLOR;
  return LANG_COLORS[lang.toLowerCase()] ?? DEFAULT_COLOR;
}
```

**Step 2: Create graph layout utility**

Create `apps/dashboard/src/lib/graph-layout.ts`:

```typescript
import type { GraphCluster, GraphClusterEdge } from "./types.js";

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  z: number;
  fileCount: number;
  languages: Record<string, number>;
}

export interface LayoutEdge {
  source: string;
  target: string;
  count: number;
}

/**
 * Position clusters using d3-force-3d.
 * Returns a promise that resolves once layout stabilizes.
 */
export async function layoutClusters(
  clusters: GraphCluster[],
  edges: GraphClusterEdge[],
): Promise<{ nodes: LayoutNode[]; edges: LayoutEdge[] }> {
  // Dynamic import — d3-force-3d is heavy
  const d3 = await import("d3-force-3d");

  const nodes = clusters.map((c) => ({
    id: c.dir,
    x: 0,
    y: 0,
    z: 0,
    fileCount: c.fileCount,
    languages: c.languages,
  }));

  const links = edges.map((e) => ({
    source: e.source,
    target: e.target,
    count: e.count,
  }));

  const sim = d3
    .forceSimulation(nodes, 3)
    .force("charge", d3.forceManyBody().strength(-100))
    .force(
      "link",
      d3.forceLink(links).id((d: any) => d.id).distance(50),
    )
    .force("center", d3.forceCenter())
    .stop();

  // Run simulation synchronously (300 ticks is usually enough)
  for (let i = 0; i < 300; i++) sim.tick();

  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      x: n.x ?? 0,
      y: n.y ?? 0,
      z: n.z ?? 0,
      fileCount: n.fileCount,
      languages: n.languages,
    })),
    edges: links.map((l) => ({
      source: typeof l.source === "string" ? l.source : (l.source as any).id,
      target: typeof l.target === "string" ? l.target : (l.target as any).id,
      count: l.count,
    })),
  };
}
```

**Step 3: Create shared types file**

Create `apps/dashboard/src/lib/types.ts` (shared graph types for dashboard):

```typescript
export interface GraphCluster {
  dir: string;
  fileCount: number;
  languages: Record<string, number>;
}

export interface GraphClusterEdge {
  source: string;
  target: string;
  count: number;
}

export interface GraphSummary {
  clusters: GraphCluster[];
  edges: GraphClusterEdge[];
}

export interface GraphFileNode {
  path: string;
  language: string | null;
  hubScore: number;
  isHub: boolean;
  exports: string[];
  commits: number;
  recent90d: number;
}

export interface GraphFileEdge {
  source: string;
  target: string;
}

export interface GraphCochange {
  a: string;
  b: string;
  count: number;
}

export interface GraphDetail {
  files: GraphFileNode[];
  edges: GraphFileEdge[];
  cochanges: GraphCochange[];
}
```

**Step 4: Build**

Run: `pnpm --filter @lens/dashboard build`

**Step 5: Commit**

```
feat(dashboard): graph layout utility + language colors + graph types
```

---

## Task 8: Create API hook and route for Explore page

**Files:**
- Create: `apps/dashboard/src/queries/use-repo-graph.ts`
- Modify: `apps/dashboard/src/lib/api.ts`
- Modify: `apps/dashboard/src/router.tsx`

**Step 1: Add graph API method**

In `apps/dashboard/src/lib/api.ts`, add:

```typescript
repoGraph: (repoPath: string, dir?: string) =>
  fetchOk(`${API}/graph`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoPath, dir }),
  }).then((r) => r.json()),
```

**Step 2: Create useRepoGraph hook**

Create `apps/dashboard/src/queries/use-repo-graph.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { GraphDetail, GraphSummary } from "../lib/types.js";

export function useGraphSummary(repoPath: string | undefined) {
  return useQuery<GraphSummary>({
    queryKey: ["graph-summary", repoPath],
    queryFn: () => api.repoGraph(repoPath!),
    enabled: !!repoPath,
  });
}

export function useGraphDetail(repoPath: string | undefined, dir: string | undefined) {
  return useQuery<GraphDetail>({
    queryKey: ["graph-detail", repoPath, dir],
    queryFn: () => api.repoGraph(repoPath!, dir),
    enabled: !!repoPath && !!dir,
  });
}
```

**Step 3: Add Explore route**

In `apps/dashboard/src/router.tsx`, add import and route:

```typescript
import { Explore } from "./pages/Explore.js";
```

Add to children array (before traces):

```typescript
{ path: "repos/:repoId/explore", element: <Explore /> },
```

**Step 4: Build**

Run: `pnpm --filter @lens/dashboard build`
(Will fail because Explore.tsx doesn't exist yet — that's expected, just verify other changes compile.)

**Step 5: Commit**

```
feat(dashboard): graph API hook + explore route setup
```

---

## Task 9: Build the Explore page shell

**Files:**
- Create: `apps/dashboard/src/pages/Explore.tsx`

**Step 1: Create Explore page with Canvas**

This is the page shell: full-screen R3F canvas with a simple particle test, command palette placeholder, and back navigation.

```tsx
import { PageHeader } from "@lens/ui";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { useRepos } from "../queries/use-repos.js";
import { useGraphSummary } from "../queries/use-repo-graph.js";
import { StatusBadge } from "../components/StatusBadge.js";

export function Explore() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);

  const { data: summary, isLoading } = useGraphSummary(repo?.root_path);

  if (!repoId) return null;

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <PageHeader>
        <button
          type="button"
          onClick={() => navigate(`/repos/${repoId}`)}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium truncate">{repo?.name ?? repoId}</span>
        {repo && <StatusBadge status={repo.index_status} className="ml-1" />}
        {summary && (
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
            {summary.clusters.length} clusters · {summary.edges.length} edges
          </span>
        )}
      </PageHeader>

      <div className="flex-1 min-h-0 bg-black">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <Canvas camera={{ position: [0, 0, 100], fov: 60 }}>
            <ambientLight intensity={0.3} />
            <pointLight position={[50, 50, 50]} intensity={1} />
            <OrbitControls enableDamping dampingFactor={0.05} />
            {/* Galaxy scene will go here in next task */}
          </Canvas>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Add Explore link to RepoDetail sidebar**

In `apps/dashboard/src/pages/RepoDetail.tsx`, add "Explore" to the SECTIONS array and import Globe from lucide-react. Also add the section routing. The Explore link should navigate to `/repos/:repoId/explore` instead of switching tabs.

**Step 3: Build and verify**

Run: `pnpm --filter @lens/dashboard build`
Navigate to `/repos/<id>/explore` — should see black canvas with orbit controls.

**Step 4: Commit**

```
feat(dashboard): Explore page shell with R3F canvas and orbit controls
```

---

## Task 10: Build ClusterCloud component (InstancedMesh)

**Files:**
- Create: `apps/dashboard/src/components/explore/ClusterCloud.tsx`
- Modify: `apps/dashboard/src/pages/Explore.tsx`

**Step 1: Create ClusterCloud**

This is the core rendering component. Uses InstancedMesh to render all directory clusters as spheres in a single draw call.

```tsx
import { useRef, useMemo, useEffect } from "react";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import type { LayoutNode } from "../../lib/graph-layout.js";
import { languageColor } from "../../lib/language-colors.js";

interface ClusterCloudProps {
  nodes: LayoutNode[];
  onSelect: (clusterId: string) => void;
  selectedId: string | null;
}

export function ClusterCloud({ nodes, onSelect, selectedId }: ClusterCloudProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tempObj = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  // Set instance transforms + colors
  useEffect(() => {
    if (!meshRef.current) return;
    const mesh = meshRef.current;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const scale = Math.max(0.5, Math.sqrt(n.fileCount) * 0.3);
      tempObj.position.set(n.x, n.y, n.z);
      tempObj.scale.setScalar(scale);
      tempObj.updateMatrix();
      mesh.setMatrixAt(i, tempObj.matrix);

      // Color by dominant language
      const topLang = Object.entries(n.languages).sort((a, b) => b[1] - a[1])[0];
      const hex = languageColor(topLang?.[0] ?? null);
      const isSelected = n.id === selectedId;
      tempColor.set(hex);
      if (isSelected) tempColor.multiplyScalar(1.5);
      mesh.setColorAt(i, tempColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [nodes, selectedId, tempObj, tempColor]);

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, nodes.length]}
        onClick={(e) => {
          e.stopPropagation();
          const idx = e.instanceId;
          if (idx != null && nodes[idx]) onSelect(nodes[idx].id);
        }}
      >
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial transparent opacity={0.85} />
      </instancedMesh>

      {/* Labels — only show for clusters with enough files */}
      {nodes
        .filter((n) => n.fileCount >= 3)
        .map((n) => (
          <Billboard key={n.id} position={[n.x, n.y + Math.sqrt(n.fileCount) * 0.4, n.z]}>
            <Text fontSize={1.2} color="white" anchorY="bottom" outlineWidth={0.05} outlineColor="black">
              {n.id}
            </Text>
          </Billboard>
        ))}
    </group>
  );
}
```

**Step 2: Integrate into Explore page**

Update Explore.tsx to compute layout and render ClusterCloud inside the Canvas. Use `useMemo` or `useEffect` + state to run `layoutClusters()` when summary data arrives.

**Step 3: Build and verify**

Run: `pnpm --filter @lens/dashboard build`
Navigate to explore page — should see colored spheres positioned by force layout with directory labels.

**Step 4: Commit**

```
feat(dashboard): ClusterCloud InstancedMesh renderer with force layout
```

---

## Task 11: Build EdgeLines component

**Files:**
- Create: `apps/dashboard/src/components/explore/EdgeLines.tsx`

**Step 1: Create EdgeLines**

Renders import edges between clusters as lines. Uses drei's `<Line>` component.

```tsx
import { Line } from "@react-three/drei";
import type { LayoutNode, LayoutEdge } from "../../lib/graph-layout.js";

interface EdgeLinesProps {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  dimmed?: boolean;
}

export function EdgeLines({ nodes, edges, dimmed }: EdgeLinesProps) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <group>
      {edges.map((e) => {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) return null;
        const opacity = dimmed ? 0.1 : Math.min(0.6, 0.1 + e.count * 0.05);
        return (
          <Line
            key={`${e.source}-${e.target}`}
            points={[
              [s.x, s.y, s.z],
              [t.x, t.y, t.z],
            ]}
            color="#4488ff"
            lineWidth={Math.min(2, 0.5 + e.count * 0.1)}
            opacity={opacity}
            transparent
          />
        );
      })}
    </group>
  );
}
```

**Step 2: Add to Canvas in Explore.tsx**

**Step 3: Build and verify**

**Step 4: Commit**

```
feat(dashboard): EdgeLines component for cluster/file import edges
```

---

## Task 12: Build CameraController (fly-to animation)

**Files:**
- Create: `apps/dashboard/src/components/explore/CameraController.tsx`

**Step 1: Create CameraController**

Handles smooth camera transitions when selecting a cluster or file. Uses `useFrame` to animate.

```tsx
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface CameraControllerProps {
  target: [number, number, number] | null;
  distance?: number;
}

export function CameraController({ target, distance = 30 }: CameraControllerProps) {
  const { camera } = useThree();
  const targetVec = useRef(new THREE.Vector3());
  const posVec = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!target) return;

    targetVec.current.set(...target);
    posVec.current.copy(targetVec.current).add(new THREE.Vector3(0, 0, distance));

    camera.position.lerp(posVec.current, 0.03);
    // Look at target
    const lookAt = new THREE.Vector3();
    lookAt.copy(camera.position).lerp(targetVec.current, 0.05);
  });

  return null;
}
```

**Step 2: Build and verify**

**Step 3: Commit**

```
feat(dashboard): CameraController with smooth fly-to animation
```

---

## Task 13: Build CommandPalette component

**Files:**
- Create: `apps/dashboard/src/components/explore/CommandPalette.tsx`

**Step 1: Create CommandPalette**

Floating search overlay triggered by Cmd+K or `/`. Calls grep endpoint for autocomplete.

```tsx
import { Badge } from "@lens/ui";
import { Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api.js";

interface GrepMatch {
  path: string;
  score: number;
  isHub: boolean;
  exports: string[];
}

interface CommandPaletteProps {
  repoPath: string;
  onSelect: (path: string) => void;
  onClose: () => void;
  open: boolean;
}

export function CommandPalette({ repoPath, onSelect, onClose, open }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GrepMatch[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  // Focus on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.repoGraph(repoPath); // fallback: use grep
        // Actually use grep for search
        const grepRes = await fetch(`http://localhost:4111/api/dashboard/grep`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoPath, query: query.trim(), limit: 10 }),
        }).then((r) => r.json());

        const allMatches: GrepMatch[] = [];
        for (const term of grepRes.terms ?? []) {
          for (const m of grepRes.results?.[term] ?? []) {
            if (!allMatches.find((x) => x.path === m.path)) {
              allMatches.push(m);
            }
          }
        }
        setResults(allMatches.slice(0, 10));
        setSelectedIdx(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, repoPath]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIdx]) {
        e.preventDefault();
        onSelect(results[selectedIdx].path);
        onClose();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [results, selectedIdx, onSelect, onClose],
  );

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Palette */}
      <div className="relative w-full max-w-lg rounded-lg border border-border bg-background shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files, functions, symbols..."
            className="h-10 flex-1 bg-transparent text-sm focus:outline-none"
          />
          {loading && (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {results.length > 0 && (
          <div className="max-h-64 overflow-auto py-1">
            {results.map((r, i) => (
              <button
                key={r.path}
                type="button"
                onClick={() => {
                  onSelect(r.path);
                  onClose();
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                  i === selectedIdx ? "bg-accent" : "hover:bg-accent/50"
                }`}
              >
                <span className="flex-1 truncate font-mono">{r.path}</span>
                {r.isHub && (
                  <Badge variant="outline" className="text-[9px]">
                    hub
                  </Badge>
                )}
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {r.score.toFixed(1)}
                </span>
              </button>
            ))}
          </div>
        )}

        {query.length >= 2 && results.length === 0 && !loading && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">No results</div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Wire into Explore page**

Add state for palette open/close, keyboard listener for Cmd+K and `/`, and pass repoPath + callbacks.

**Step 3: Build and verify**

**Step 4: Commit**

```
feat(dashboard): CommandPalette with grep-powered autocomplete
```

---

## Task 14: Wire everything together in Explore page

**Files:**
- Modify: `apps/dashboard/src/pages/Explore.tsx`

**Step 1: Full integration**

This is the wiring task: connect layout computation, cluster selection, camera movement, command palette, and edge highlighting. The Explore page manages all state and passes it down.

Key state:
- `layout` — computed from `layoutClusters(summary)`, stored in state
- `selectedCluster` — which cluster is focused
- `selectedFile` — which file is spotlighted (from command palette or click)
- `paletteOpen` — command palette visibility
- `cameraTarget` — [x,y,z] for fly-to animation

Key flows:
1. Data loads → `layoutClusters()` runs → ClusterCloud renders
2. Click cluster → set selectedCluster → camera flies to it
3. Cmd+K → palette opens → type query → grep → select result → find cluster → fly to file
4. Esc → deselect → camera pulls back to overview

**Step 2: Add keyboard listeners**

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setPaletteOpen(true);
    }
    if (e.key === "/" && !paletteOpen && document.activeElement === document.body) {
      e.preventDefault();
      setPaletteOpen(true);
    }
    if (e.key === "Escape") {
      setSelectedCluster(null);
      setSelectedFile(null);
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, [paletteOpen]);
```

**Step 3: Build, test full flow**

Run: `pnpm --filter @lens/dashboard build && pnpm build:publish`
Restart daemon, navigate to `/repos/<id>/explore`.

Expected: Galaxy of colored spheres, labels on clusters, edges between them. Cmd+K opens search. Clicking cluster zooms in. Search finds files.

**Step 4: Commit**

```
feat(dashboard): wire Explore page — layout, selection, camera, palette
```

---

## Task 15: Add bloom post-processing for spotlight

**Files:**
- Modify: `apps/dashboard/src/pages/Explore.tsx` or `GalaxyScene.tsx`

**Step 1: Add selective bloom**

```tsx
import { EffectComposer, Bloom } from "@react-three/postprocessing";

// Inside Canvas:
<EffectComposer>
  <Bloom
    luminanceThreshold={0.8}
    luminanceSmoothing={0.3}
    intensity={0.5}
  />
</EffectComposer>
```

Selected/hub nodes set their emissive value above the threshold so they glow. Non-selected nodes stay below.

**Step 2: Build and verify glow effect**

**Step 3: Commit**

```
feat(dashboard): bloom post-processing for spotlight effect
```

---

## Task 16: Build publish bundle and verify end-to-end

**Step 1: Full rebuild**

```bash
pnpm -r build
pnpm build:publish
```

**Step 2: Restart daemon and test**

```bash
lens daemon stop && lens daemon start
```

Test all entry points:
- Dashboard: `http://localhost:4111/repos/<id>/explore`
- CLI: `lens graph` and `lens graph packages/engine/src`
- MCP: verify `lens_graph` tool is registered

**Step 3: Commit**

```
feat(v2): 3D code explorer — galaxy view, command palette, lens_graph
```
