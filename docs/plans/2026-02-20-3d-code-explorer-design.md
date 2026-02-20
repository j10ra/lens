# 3D Code Explorer — Galaxy View

## Overview

Interactive 3D galaxy visualization of a codebase. Files rendered as particles in 3D space, clustered by directory. Users search via a floating command palette, camera flies to results with spotlight + edge highlighting. Drill-down from directory clusters → files → file detail.

Same graph data exposed via MCP (`lens_graph`) and CLI (`lens graph`) for AI agent consumption.

## Core Decisions

- **Rendering**: React Three Fiber + drei + postprocessing
- **Layout**: d3-force-3d for node positioning
- **Interaction**: Galaxy particle cloud with fly-to spotlight on search
- **Search**: Floating command palette (Cmd+K / `/`), autocomplete via grep engine
- **Scale**: LOD + InstancedMesh, directory clustering caps visible nodes at ~500

## Data Flow

```
Page load  → GET /repos/:repoId/graph?summary=true
             Returns directory clusters + inter-cluster edges (~5KB)

Click cluster → GET /repos/:repoId/graph?dir=packages/engine
                Returns files + edges within that directory (~50KB)

Search → POST /api/dashboard/grep
         Returns matched files, camera flies to them, spotlight + edges

Click file → GET /repos/:repoId/files/:path
             Detail overlay with exports, imports, sections, git stats
```

Single-fetch per interaction. Client owns layout computation. No streaming needed — even 14K-file repos stay under 2MB when chunked by directory.

## Scale Strategy: Three-Tier LOD

| Zoom level | Renders | Tech |
|------------|---------|------|
| Far | Directory clusters as particles (~50-200) | Single InstancedMesh, 1 draw call |
| Mid | Files within focused cluster (~100-500) | InstancedMesh per cluster, Billboard labels |
| Near | Single file expanded with detail | Regular mesh + HTML overlay |

Clustering by first 2 path segments. Force layout runs on clusters only (fast). File positions within cluster computed on-demand when expanded. Render budget stays under 1000 draw calls regardless of repo size.

## Graph Endpoint

```
GET /repos/:repoId/graph?summary=true
GET /repos/:repoId/graph?dir=<directory>
```

### Summary mode response
```json
{
  "clusters": [
    { "dir": "packages/engine", "fileCount": 45, "languages": {"typescript": 40, "json": 5} }
  ],
  "edges": [
    { "source": "packages/engine", "target": "packages/core", "count": 12 }
  ]
}
```

### Directory mode response
```json
{
  "files": [
    { "path": "src/grep/scorer.ts", "language": "typescript", "hubScore": 0.8, "isHub": true, "exports": ["scoreFile"], "commits": 42, "recent90d": 8 }
  ],
  "edges": [
    { "source": "src/grep/scorer.ts", "target": "src/grep/grep.ts", "type": "import" }
  ],
  "cochanges": [
    { "a": "src/grep/scorer.ts", "b": "src/grep/grep.ts", "count": 15 }
  ]
}
```

Built from existing queries — no schema changes needed.

## Visual Encoding

| Property | Maps to |
|----------|---------|
| Node size | hubScore (0-1) → radius |
| Node color | Language (TS=blue, JSON=yellow, MD=gray, CSS=purple) |
| Node glow | Git recency (hot files glow brighter) |
| Edge opacity | Cochange count (thicker = more frequent) |
| Spotlight | Selected file gets bloom, connected files subtly highlighted |

## Component Architecture

```
apps/dashboard/src/
  pages/Explore.tsx                    ← Route, data fetching, state
  components/explore/
    GalaxyScene.tsx                    ← R3F scene root
    ClusterCloud.tsx                   ← InstancedMesh for directory clusters
    ExpandedCluster.tsx                ← InstancedMesh for files in focused dir
    EdgeLines.tsx                      ← Import/cochange edge rendering
    CameraController.tsx               ← Fly-to, orbit, zoom transitions
    CommandPalette.tsx                 ← Floating search with autocomplete
    FileDetailPanel.tsx                ← Right overlay on file select
    Breadcrumb.tsx                     ← Navigation: repo > cluster > file
  lib/
    graph-layout.ts                    ← d3-force-3d wrapper, cluster computation
    language-colors.ts                 ← Language → hex color mapping
  queries/
    use-repo-graph.ts                  ← useRepoGraph(repoId, dir?) hook
```

## Interactions

| Action | Result |
|--------|--------|
| Page load | Galaxy of directory clusters, slow ambient orbit |
| Scroll/pinch | Zoom. Crossing LOD threshold expands nearest cluster |
| Click cluster | Camera flies to cluster, files expand |
| Click file | File detail panel slides in from right |
| Cmd+K or `/` | Command palette opens, galaxy dims |
| Type query | Live autocomplete via grep. Ranked: hubs > exports > mentions |
| Select result | Palette closes, fly-to file, spotlight + edges |
| Esc / click empty | Deselect, un-spotlight, camera pulls back |

## MCP + CLI: `lens_graph`

Same `/graph` endpoint exposed to AI agents:

```
# CLI
lens graph <repoId>                     # summary mode
lens graph <repoId> --dir packages/engine  # directory mode

# MCP tool
lens_graph { repoId, dir? }            # same params
```

Gives AI agents pre-computed dependency graph instead of reconstructing from grep + glob. "What depends on auth.ts?" becomes one call.

## Dependencies (dashboard)

```
@react-three/fiber              ← R3F core
@react-three/drei               ← OrbitControls, Billboard, Text, Line
@react-three/postprocessing     ← Bloom for spotlight
three                           ← Peer dependency
d3-force-3d                     ← 3D force layout
```

## Phases

### Phase 1 (this implementation)
- Galaxy view with directory clustering
- Command palette search
- Fly-to spotlight with edge highlighting
- File detail panel
- `/graph` endpoint (summary + dir modes)
- `lens_graph` MCP tool + CLI command

### Phase 2 (future)
- Function-level drill-down within files (needs TS AST call graph)
- VS Code integration (click node → open in editor)
- Multi-repo galaxy view
