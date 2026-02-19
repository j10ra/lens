# Phase 03: CLI + Dashboard - Research

**Researched:** 2026-02-20
**Domain:** CLI subcommands (citty), Vite + React SPA (shadcn/ui, TanStack Query, TanStack Store), Hono static file serving, trace waterfall UI
**Confidence:** HIGH — stack verified against npm registry, official docs, and existing codebase inspection

---

## Summary

Phase 3 builds two human interfaces on top of the daemon that Phase 1 and Phase 2 established. The CLI gains four new subcommands (`register`, `remove`, `list`, `grep`) using the citty framework already wired in Phase 1. The dashboard is a Vite + React SPA served directly by the daemon via Hono's `serveStatic` middleware — no separate dev server needed in production.

The key architectural insight: the dashboard is a static asset bundle that `apps/daemon` builds and then serves from its own HTTP port. The dashboard calls `http://localhost:4111/...` for all data — the same endpoints the CLI uses. There is no special dashboard-only API path. The daemon adds one new route: `GET /traces` (and `GET /traces/:id`) so the dashboard can display the trace waterfall.

All dashboard data fetching uses TanStack Query v5 (version 5.90.21). Client-side UI state (selected repo, active trace, filter inputs) uses TanStack Store v0.9.1 — a tiny reactive store that eliminates unnecessary re-renders through selector functions. shadcn/ui provides all visual components; no custom UI primitives are written.

**Primary recommendation:** Build the dashboard SPA in `apps/dashboard`, run `vite build` to produce `dist/`, then configure the daemon to `serveStatic({ root: './dist' })` from the daemon's working directory pointing to the dashboard's built output. Use a path alias or post-build copy step to co-locate assets.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLI-02 | Commands: register, remove, list, status, grep | citty `defineCommand` + `subCommands` pattern; all five commands call `fetch(:4111/...)` daemon HTTP routes |
| CLI-03 | Formatted terminal output for human readability | `console.log` with aligned columns using template literals; `kleur` or `picocolors` for ANSI color (optional, zero deps with ANSI escape codes) |
| DASH-01 | Vite + React SPA with shadcn/ui components | React 19, Vite 7, `shadcn@3.8.5` CLI; `@vitejs/plugin-react@5.1.4`; components.json config; Tailwind v4 CSS |
| DASH-02 | Trace waterfall viewer — route → spans → sub-spans with timing | Custom waterfall component built with shadcn/ui primitives (no third-party chart lib needed); flat span list reconstructed via `parentSpanId`; horizontal bars via CSS width % of total trace duration |
| DASH-03 | Repo file explorer with indexed file list and metadata | TanStack Query polling `GET /repos` + `GET /repos/:id/files`; shadcn Table; TanStack Store for selected repo/file |
| DASH-04 | TanStack Query for all daemon API calls | `@tanstack/react-query@5.90.21`; `QueryClientProvider` at root; `useQuery` per data domain; `staleTime` + `refetchInterval` tuned per endpoint |
| DASH-05 | TanStack Store for client-side UI state | `@tanstack/react-store@0.9.1`; `createStore` + `useStore` with selectors; one store per logical domain (repoStore, traceStore) |
| DASH-06 | Connects to daemon API on localhost:4111 | All `queryFn` call `fetch('http://localhost:4111/...')`; base URL constant extracted to `src/lib/api.ts` |
| DAEM-03 | Serves dashboard static files from built SPA | Hono `serveStatic` from `@hono/node-server/serve-static`; serve `dist/` with SPA fallback to `index.html` |
</phase_requirements>

---

## Standard Stack

### Core (Dashboard)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 19.2.4 | UI framework | TanStack Query peer dep supports ^18 or ^19; React 19 is current |
| react-dom | 19.2.4 | DOM renderer | Paired with react |
| vite | 7.3.1 | Build tool + dev server | Project convention (Vite for apps); HMR in development |
| @vitejs/plugin-react | 5.1.4 | JSX transform + HMR | Official React plugin for Vite; Babel + React Fast Refresh |
| tailwindcss | 4.2.0 | CSS utility framework | shadcn/ui requirement; v4 uses `@tailwindcss/vite` plugin (no config file needed) |
| @tailwindcss/vite | 4.x | Tailwind v4 Vite integration | Replaces postcss/tailwind config; imports via `@import "tailwindcss"` in CSS |
| shadcn (CLI) | 3.8.5 | Component scaffolding | `npx shadcn init` + `npx shadcn add [component]` adds to `src/components/ui/` |
| @tanstack/react-query | 5.90.21 | Server state + caching | Requirement DASH-04; automatic background refetch, stale-while-revalidate |
| @tanstack/react-store | 0.9.1 | Client-side UI state | Requirement DASH-05; ~2KB, selector-based re-render optimization |
| react-router | 7.13.0 | Client-side routing | In v7 everything imports from "react-router" (no react-router-dom); `createBrowserRouter` |

### Core (CLI additions)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| citty | 0.2.1 | CLI argument parsing | Already installed in Phase 1; `defineCommand` for each subcommand |

### Supporting (Dashboard)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-query-devtools | 5.x | Query cache inspector | Development only; `<ReactQueryDevtools />` at root |
| picocolors | 1.1.1 | ANSI terminal colors (CLI) | Zero deps; ESM-friendly; for CLI formatted output only |

### Daemon additions
| Library | Source | Purpose | When to Use |
|---------|--------|---------|-------------|
| serveStatic | @hono/node-server/serve-static (already installed) | Serve dashboard static files | DAEM-03; no new install needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Store | Zustand | Zustand is more mature; TanStack Store is prescribed by requirements |
| TanStack Store | React Context + useState | Context causes full subtree re-renders; Store selectors are fine-grained |
| Custom waterfall | thundra-trace-chart | Library is not maintained; simple CSS-based bars are sufficient and fully customizable |
| react-router | TanStack Router | TanStack Router has file-based routing complexity; react-router v7 is simpler for this use case |
| tailwindcss v4 | tailwindcss v3 | v4 is current; v3 requires separate postcss config; shadcn now targets v4 |

**Installation (dashboard app):**
```bash
pnpm --filter @lens/dashboard add react react-dom react-router
pnpm --filter @lens/dashboard add @tanstack/react-query @tanstack/react-query-devtools @tanstack/react-store
pnpm --filter @lens/dashboard add -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite typescript @types/react @types/react-dom
```

**Installation (CLI additions):**
```bash
# citty is already installed — no new packages needed
# picocolors optional — can use ANSI escape codes directly
pnpm --filter @lens/cli add picocolors
```

---

## Architecture Patterns

### Recommended Project Structure

**Dashboard (`apps/dashboard/`):**
```
apps/dashboard/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── components.json          # shadcn config
├── package.json
└── src/
    ├── main.tsx             # ReactDOM.createRoot, QueryClientProvider, RouterProvider
    ├── globals.css          # @import "tailwindcss"; CSS variables from shadcn
    ├── lib/
    │   └── api.ts           # DAEMON_URL constant, typed fetch wrappers
    ├── store/
    │   ├── repo-store.ts    # createStore({ selectedRepoId, selectedFilePath })
    │   └── trace-store.ts   # createStore({ selectedTraceId, filterText })
    ├── queries/
    │   ├── use-repos.ts     # useQuery hooks for /repos
    │   ├── use-traces.ts    # useQuery hooks for /traces
    │   └── use-grep.ts      # useQuery hooks for /grep
    ├── components/
    │   ├── ui/              # shadcn generated components (do not edit)
    │   └── TraceWaterfall.tsx  # custom waterfall built from shadcn primitives
    ├── pages/
    │   ├── TracesPage.tsx
    │   ├── ReposPage.tsx
    │   └── RepoDetailPage.tsx
    └── router.tsx           # createBrowserRouter, routes definition
```

**CLI (`packages/cli/src/`):**
```
packages/cli/src/
├── index.ts         # main defineCommand + subCommands, runMain
├── commands/
│   ├── register.ts  # lens register <path> [--name <name>]
│   ├── remove.ts    # lens remove <id>
│   ├── list.ts      # lens list
│   ├── grep.ts      # lens grep <query> [--repo <path>] [--limit <n>]
│   └── status.ts    # existing — no change needed
└── lib/
    ├── daemon.ts    # DAEMON_URL, typed fetch helpers
    └── format.ts    # formatTable(), formatRow(), printResult()
```

**Daemon additions (`apps/daemon/src/`):**
```
apps/daemon/src/
├── routes/
│   ├── traces.ts    # GET /traces, GET /traces/:id (new for DAEM-03/dashboard)
│   └── files.ts     # GET /repos/:id/files (file list + metadata for repo explorer)
└── http.ts          # add serveStatic + traces route + files route
```

---

### Pattern 1: citty Subcommand with Args

**What:** Each CLI subcommand is a separate file exporting a `defineCommand` result, imported into `index.ts` via `subCommands`.

**When to use:** Every CLI command except `status` (already implemented) needs this pattern.

```typescript
// Source: https://github.com/unjs/citty
// packages/cli/src/commands/register.ts
import { defineCommand } from "citty";

export const register = defineCommand({
  meta: { description: "Register a repo with the LENS daemon" },
  args: {
    path: {
      type: "positional",
      description: "Absolute path to the repo root",
      required: true,
    },
    name: {
      type: "string",
      alias: "n",
      description: "Human-readable name (defaults to directory name)",
    },
  },
  async run({ args }) {
    const res = await fetch("http://localhost:4111/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: args.path, name: args.name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      console.error(`Error: ${err.error}`);
      process.exit(1);
    }
    const repo = await res.json();
    console.log(`Registered: ${repo.name} (${repo.id})`);
    console.log(`  path   : ${repo.root_path}`);
    console.log(`  status : ${repo.index_status}`);
  },
});

// packages/cli/src/index.ts
import { defineCommand, runMain } from "citty";
import { grep } from "./commands/grep.js";
import { list } from "./commands/list.js";
import { register } from "./commands/register.js";
import { remove } from "./commands/remove.js";
import { status } from "./commands/status.js";

const main = defineCommand({
  meta: { name: "lens", version: "2.0.0", description: "LENS — structured code query engine" },
  subCommands: { status, register, remove, list, grep },
});

runMain(main);
```

### Pattern 2: CLI Formatted Output

**What:** Aligned columns for list/grep output; no external table library needed.

**When to use:** `lens list` (tabular repos), `lens grep` (ranked file results per term).

```typescript
// packages/cli/src/lib/format.ts
// No external deps — ANSI codes via process.stdout.isTTY check

function pad(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width) : str + " ".repeat(width - str.length);
}

export function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );
  const line = headers.map((h, i) => pad(h, widths[i]!)).join("  ");
  console.log(line);
  console.log("-".repeat(line.length));
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell, widths[i]!)).join("  "));
  }
}

// Example lens list output:
// ID                                    NAME         STATUS   LAST INDEXED
// ---------------------------------------------------------------------------
// a1b2c3d4-...                          my-project   ready    2026-02-20
```

### Pattern 3: Vite Config for Dashboard

**What:** Tailwind v4 via `@tailwindcss/vite` plugin; path alias `@` → `./src`; no Tailwind config file needed.

```typescript
// apps/dashboard/vite.config.ts
// Source: https://vitejs.dev/config/, https://ui.shadcn.com/docs/installation/vite
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

```typescript
// apps/dashboard/tsconfig.json — extends base
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "noEmit": true
  },
  "include": ["src"]
}
```

```css
/* apps/dashboard/src/globals.css */
@import "tailwindcss";  /* Tailwind v4 — no @tailwind base/components/utilities */
/* shadcn CSS variables added by: npx shadcn init */
```

### Pattern 4: QueryClient Setup and useQuery

**What:** Single `QueryClient` at app root with sensible defaults for a local daemon (fast refetch, short stale time).

```typescript
// Source: https://tanstack.com/query/v5/docs/framework/react/installation
// apps/dashboard/src/main.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./router.js";
import "./globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,        // 5s — daemon data refreshes fast
      refetchOnWindowFocus: true,
      retry: 2,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

```typescript
// apps/dashboard/src/queries/use-repos.ts
import { useQuery } from "@tanstack/react-query";
import { DAEMON_URL } from "../lib/api.js";

export type Repo = {
  id: string;
  name: string;
  root_path: string;
  index_status: string;
  last_indexed_at: string | null;
};

export function useRepos() {
  return useQuery<Repo[]>({
    queryKey: ["repos"],
    queryFn: async () => {
      const res = await fetch(`${DAEMON_URL}/repos`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 10_000,  // poll every 10s — repos don't change often
  });
}

// apps/dashboard/src/lib/api.ts
export const DAEMON_URL = "http://localhost:4111";
```

### Pattern 5: TanStack Store for UI State

**What:** One store per domain; selectors prevent unnecessary re-renders.

```typescript
// Source: https://github.com/TanStack/store/blob/main/docs/framework/react/quick-start.md
// apps/dashboard/src/store/repo-store.ts
import { createStore, useStore } from "@tanstack/react-store";

interface RepoState {
  selectedRepoId: string | null;
  selectedFilePath: string | null;
}

export const repoStore = createStore<RepoState>({
  selectedRepoId: null,
  selectedFilePath: null,
});

// Selector hooks — components only re-render when their slice changes
export const useSelectedRepoId = () =>
  useStore(repoStore, (s) => s.selectedRepoId);

export const useSelectedFilePath = () =>
  useStore(repoStore, (s) => s.selectedFilePath);

// Mutators
export const selectRepo = (id: string | null) =>
  repoStore.setState((s) => ({ ...s, selectedRepoId: id, selectedFilePath: null }));

export const selectFile = (path: string | null) =>
  repoStore.setState((s) => ({ ...s, selectedFilePath: path }));
```

```typescript
// apps/dashboard/src/store/trace-store.ts
import { createStore, useStore } from "@tanstack/react-store";

interface TraceUIState {
  selectedTraceId: string | null;
  filterText: string;
}

export const traceStore = createStore<TraceUIState>({
  selectedTraceId: null,
  filterText: "",
});

export const useSelectedTraceId = () =>
  useStore(traceStore, (s) => s.selectedTraceId);

export const useTraceFilter = () =>
  useStore(traceStore, (s) => s.filterText);

export const selectTrace = (id: string | null) =>
  traceStore.setState((s) => ({ ...s, selectedTraceId: id }));

export const setTraceFilter = (text: string) =>
  traceStore.setState((s) => ({ ...s, filterText: text }));
```

### Pattern 6: Hono Static File Serving (DAEM-03)

**What:** Daemon serves dashboard SPA from `dist/` with `index.html` fallback for all unmatched GET routes.

**Critical ordering:** API routes must be mounted BEFORE `serveStatic` — otherwise the wildcard `*` matches API paths.

```typescript
// Source: https://hono.dev/docs/getting-started/nodejs
// apps/daemon/src/http.ts (additions)
import { serveStatic } from "@hono/node-server/serve-static";

// ... existing routes ...

// API routes first (order matters — serveStatic is a catch-all)
app.route("/health", healthRoutes);
app.route("/grep", grepRoutes);
app.route("/repos", reposRoutes);
app.route("/traces", tracesRoutes);  // new in Phase 3

// Dashboard static files — root path points to dashboard build output
// When running from apps/daemon/ (cwd), dist is at ../../apps/dashboard/dist/
// Use env var or config for the actual path:
const DASHBOARD_DIST = process.env.LENS_DASHBOARD_DIST
  ?? join(dirname(fileURLToPath(import.meta.url)), "../../dashboard/dist");

app.use("*", serveStatic({ root: DASHBOARD_DIST }));
// SPA fallback: unmatched routes → index.html (client-side router takes over)
app.use("*", serveStatic({ path: join(DASHBOARD_DIST, "index.html") }));
```

**Note on DASHBOARD_DIST path:** The daemon process runs with cwd of the project root when invoked as `node dist/index.js`. The path resolution must be relative to the built daemon file location, not cwd. Use `import.meta.url` + `fileURLToPath` for reliable ESM path resolution.

### Pattern 7: Trace Waterfall Component

**What:** Custom waterfall built with div bars and CSS width percentages — no third-party charting library needed. Uses the existing TraceStore schema (`traces`, `spans` tables with `parentSpanId`).

**Required daemon endpoint:** `GET /traces` (list recent traces), `GET /traces/:id` (spans for one trace).

```typescript
// apps/daemon/src/routes/traces.ts
// New route — exposes TraceStore data for dashboard
import { lensRoute } from "@lens/core";
import { Hono } from "hono";
// TraceStore is accessed via singleton — need getTraceStore() export from @lens/core
export const tracesRoutes = new Hono();

tracesRoutes.get(
  "/",
  lensRoute("traces.list", async (c) => {
    const limit = Number(c.req.query("limit") ?? 50);
    // Query: SELECT * FROM traces ORDER BY started_at DESC LIMIT ?
    const traces = getTraceStore().queryTraces(limit);
    return c.json(traces);
  }),
);

tracesRoutes.get(
  "/:traceId",
  lensRoute("traces.get", async (c) => {
    const { traceId } = c.req.param();
    const spans = getTraceStore().querySpans(traceId);
    if (!spans.length) return c.json({ error: "trace not found" }, 404);
    return c.json({ traceId, spans });
  }),
);
```

```typescript
// apps/dashboard/src/components/TraceWaterfall.tsx
// Reconstruction: flat spans → tree via parentSpanId → render as bars
type Span = {
  spanId: string;
  parentSpanId: string | null;
  name: string;
  startedAt: number;
  durationMs: number;
  errorMessage?: string | null;
};

function buildTree(spans: Span[]): Span[] {
  // Sort by startedAt to preserve visual order
  return [...spans].sort((a, b) => a.startedAt - b.startedAt);
}

function SpanBar({ span, traceStart, traceDuration, depth }: {
  span: Span;
  traceStart: number;
  traceDuration: number;
  depth: number;
}) {
  const left = ((span.startedAt - traceStart) / traceDuration) * 100;
  const width = (span.durationMs / traceDuration) * 100;
  return (
    <div className="flex items-center gap-2 py-0.5" style={{ paddingLeft: `${depth * 16}px` }}>
      <span className="text-xs text-muted-foreground w-48 truncate">{span.name}</span>
      <div className="flex-1 relative h-4 bg-muted rounded">
        <div
          className={`absolute h-full rounded ${span.errorMessage ? "bg-destructive" : "bg-primary"}`}
          style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-16 text-right">{span.durationMs}ms</span>
    </div>
  );
}
```

### Pattern 8: TraceStore Query Methods (needed for DAEM-03)

**What:** TraceStore must expose `queryTraces()` and `querySpans()` methods so the `/traces` route can read from SQLite.

**This requires adding two methods to `TraceStore` in `packages/core/src/trace-store.ts`:**

```typescript
// Addition to packages/core/src/trace-store.ts
queryTraces(limit = 50): TraceRow[] {
  return this.sqlite
    .prepare("SELECT * FROM traces ORDER BY started_at DESC LIMIT ?")
    .all(limit) as TraceRow[];
}

querySpans(traceId: string): SpanRow[] {
  return this.sqlite
    .prepare("SELECT * FROM spans WHERE trace_id = ? ORDER BY started_at ASC")
    .all(traceId) as SpanRow[];
}
```

**Additionally**, the daemon's `startHttpServer()` needs access to the `TraceStore` singleton. Currently `configureLensRoute(store)` sets `_store` inside `@lens/core`, but the traces route needs to call `store.queryTraces()` directly. Solution: export `getTraceStore()` from `@lens/core` that returns the configured store.

### Anti-Patterns to Avoid

- **Mounting serveStatic before API routes:** Wildcard `*` in serveStatic intercepts all requests including `/repos`, `/grep`. Always mount API routes first.
- **useStore without a selector:** `useStore(store)` without selector causes re-render on any state change. Always provide `(s) => s.specificField`.
- **Direct TraceStore import in daemon routes:** Routes should call `getTraceStore()` from `@lens/core`, not import the class directly. The singleton pattern ensures consistency.
- **Hardcoded DAEMON_URL in multiple files:** Extract to `src/lib/api.ts` as a single constant. Never scatter `http://localhost:4111` across component files.
- **queryFn without error handling:** `fetch()` does not throw on non-2xx responses. Always check `res.ok` and throw to let TanStack Query retry.
- **Console.log in daemon routes:** Daemon writes to stderr only. CLI is a terminal binary — `console.log` IS correct in CLI commands.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Data fetching state (loading, error, cache) | useState + useEffect + cache map | TanStack Query `useQuery` | Race conditions, stale closure bugs, cache invalidation complexity; DASH-04 requirement |
| Client-side UI state with fine-grained re-renders | Context + useState | TanStack Store `createStore` + `useStore` | Context re-renders entire subtree; Store selector is field-level; DASH-05 requirement |
| Terminal color + reset codes | ANSI escape string literals | `picocolors` | Platform detection, reset handling, NO_COLOR env var respect — edge cases add up |
| SPA routing fallback | Custom 404 handler | Hono `serveStatic` with `path: index.html` | Two-line pattern; handles all file types correctly |
| Waterfall chart | Custom SVG charting | CSS width % bars in divs | No canvas/SVG complexity; matches Jaeger/Zipkin style; fully styled with Tailwind |

**Key insight:** The trace waterfall is NOT a chart problem — it is a layout problem. Horizontal bars with `left: X%` and `width: Y%` on a flex container require zero chart libraries and produce identical output to commercial APM tools.

---

## Common Pitfalls

### Pitfall 1: serveStatic Root Path Resolution in ESM
**What goes wrong:** `serveStatic({ root: './apps/dashboard/dist' })` resolves relative to `process.cwd()`, which is the project root when running `node dist/index.js` from `apps/daemon/`. If the process is started from a different directory, the path is wrong.
**Why it happens:** Node.js `cwd()` is launch-directory dependent; ESM modules don't have `__dirname`.
**How to avoid:** Use `import.meta.url` to get the daemon dist file's directory, then resolve relative to that:
```typescript
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIST = join(__dirname, "../../apps/dashboard/dist");
```
**Warning signs:** Dashboard 404s when daemon is started from a non-standard directory.

### Pitfall 2: Tailwind v4 vs v3 Config Mismatch
**What goes wrong:** shadcn docs show Tailwind v3 config (`tailwind.config.ts` with `content: [...]`). v4 dropped the config file — it uses `@tailwindcss/vite` plugin + `@import "tailwindcss"` in CSS.
**Why it happens:** shadcn docs sometimes lag behind Tailwind version changes; v3/v4 are not interchangeable.
**How to avoid:** Use `@tailwindcss/vite` plugin in `vite.config.ts`. In CSS: `@import "tailwindcss"`. Do NOT create `tailwind.config.ts`. Run `npx shadcn init` — it detects Tailwind v4 automatically.
**Warning signs:** Build errors about unrecognized Tailwind config keys; CSS variables not applied.

### Pitfall 3: react-router v7 Import Path Change
**What goes wrong:** Importing from `react-router-dom` — package no longer exists in v7. All imports are from `react-router`.
**Why it happens:** v7 consolidated react-router and react-router-dom into a single package.
**How to avoid:** `import { createBrowserRouter, RouterProvider, Link, useParams } from "react-router"` — always from `"react-router"`, never from `"react-router-dom"`.
**Warning signs:** Module not found error for `react-router-dom`.

### Pitfall 4: TanStack Query v5 API Changes from v4
**What goes wrong:** Using v4 API: `useQuery('key', fn)` (positional args), `isLoading` vs `isPending`, `cacheTime` vs `gcTime`.
**Why it happens:** v5 dropped all overloads — single object argument only.
**How to avoid:**
- v5 pattern: `useQuery({ queryKey: ['repos'], queryFn: fetchRepos })`
- Use `isPending` (not `isLoading`) for initial load
- Use `gcTime` (not `cacheTime`) for garbage collection time
**Warning signs:** TypeScript errors about overload mismatch; `isLoading` always false on cache hits.

### Pitfall 5: TraceStore Not Exposing Query Methods
**What goes wrong:** `/traces` route cannot access trace data because `TraceStore` only has `pushSpan()`, `pushLog()`, `flush()`, `prune()`, `close()` — no read methods.
**Why it happens:** TraceStore was designed write-only in Phase 1 (planner optimized for minimal API).
**How to avoid:** Add `queryTraces(limit)` and `querySpans(traceId)` methods to `TraceStore` in `packages/core`. Also export `getTraceStore()` singleton accessor from `@lens/core` so daemon routes can call it.
**Warning signs:** TypeScript errors trying to access trace data; route returns empty arrays.

### Pitfall 6: Biome Linting Scope — Dashboard Files Not Included
**What goes wrong:** Biome's `files.includes` in `biome.json` only covers `packages/*/src/**` and `apps/*/src/**`. New dashboard files in `apps/dashboard/src/` are covered, but `components.json` and root-level config files are not.
**Why it happens:** `biome.json` already has `ignoreUnknown: true` — non-JS/TS files are safely ignored. This is not a blocking issue.
**How to avoid:** No change needed. Biome correctly handles `apps/dashboard/src/**/*.tsx`. The `ignoreUnknown: true` setting prevents errors on `.json` config files.

### Pitfall 7: QueryClient Instance Created Inside Component
**What goes wrong:** `new QueryClient()` inside a React component body recreates the client on every render, destroying the entire cache.
**Why it happens:** Forgetting that QueryClient must live outside the render cycle.
**How to avoid:** Create `queryClient` at module level (outside any component), or use `useRef`/`useState` if you need it inside a component (rare).

### Pitfall 8: `onlyBuiltDependencies` Missing for Vite Deps
**What goes wrong:** pnpm blocks running install scripts for new packages that require native compilation.
**Why it happens:** `pnpm.onlyBuiltDependencies` in root `package.json` is an allowlist — new packages are blocked by default.
**How to avoid:** `esbuild` (used by Vite internally) is already in `onlyBuiltDependencies`. No additional native addon packages are needed for the dashboard. If `@vitejs/plugin-react` throws a native build error, add `esbuild` (already present) — but this should not occur.

---

## Code Examples

### lens list output format

```typescript
// packages/cli/src/commands/list.ts
import { defineCommand } from "citty";

export const list = defineCommand({
  meta: { description: "List all registered repos" },
  async run() {
    const res = await fetch("http://localhost:4111/repos");
    if (!res.ok) {
      console.error("Failed to fetch repos. Is the daemon running?");
      process.exit(1);
    }
    const repos = (await res.json()) as Array<{
      id: string; name: string; root_path: string;
      index_status: string; last_indexed_at: string | null;
    }>;

    if (!repos.length) {
      console.log("No repos registered. Use: lens register <path>");
      return;
    }

    const STATUS_ICON: Record<string, string> = {
      ready: "✓", indexing: "⋯", pending: "○", error: "✗",
    };

    for (const r of repos) {
      const icon = STATUS_ICON[r.index_status] ?? "?";
      console.log(`${icon} ${r.name}`);
      console.log(`  id     : ${r.id}`);
      console.log(`  path   : ${r.root_path}`);
      console.log(`  status : ${r.index_status}`);
      if (r.last_indexed_at) console.log(`  indexed: ${r.last_indexed_at}`);
    }
  },
});
```

### lens grep output format

```typescript
// packages/cli/src/commands/grep.ts
import { defineCommand } from "citty";

export const grep = defineCommand({
  meta: { description: "Grep a registered repo by keywords" },
  args: {
    query: { type: "positional", description: "Search terms (pipe-separated: auth|session|token)", required: true },
    repo: { type: "string", alias: "r", description: "Repo root path (defaults to cwd)" },
    limit: { type: "string", alias: "l", description: "Max results per term (default 20)" },
  },
  async run({ args }) {
    const repoPath = args.repo ?? process.cwd();
    const limit = args.limit ? parseInt(args.limit, 10) : 20;

    const res = await fetch("http://localhost:4111/grep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoPath, query: args.query, limit }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      console.error(`Error: ${err.error}${err.hint ? `\n  ${err.hint}` : ""}`);
      process.exit(1);
    }

    const data = await res.json() as {
      terms: string[];
      results: Record<string, Array<{ path: string; score: number; isHub: boolean; importers: string[] }>>;
    };

    for (const term of data.terms) {
      const results = data.results[term] ?? [];
      console.log(`\n── ${term} (${results.length} results) ──`);
      for (const r of results) {
        const hub = r.isHub ? " [hub]" : "";
        const importedBy = r.importers.length ? ` ← ${r.importers.slice(0, 2).join(", ")}` : "";
        console.log(`  ${r.path}${hub}  score=${r.score.toFixed(2)}${importedBy}`);
      }
    }
  },
});
```

### shadcn component usage in dashboard

```typescript
// apps/dashboard/src/pages/ReposPage.tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRepos } from "@/queries/use-repos.js";
import { selectRepo } from "@/store/repo-store.js";

export function ReposPage() {
  const { data: repos, isPending, error } = useRepos();

  if (isPending) return <div className="p-4 text-muted-foreground">Loading...</div>;
  if (error) return <div className="p-4 text-destructive">Failed to load repos: {error.message}</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4">Repos</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Path</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {repos?.map((repo) => (
            <TableRow key={repo.id}>
              <TableCell className="font-medium">{repo.name}</TableCell>
              <TableCell>
                <Badge variant={repo.index_status === "ready" ? "default" : "secondary"}>
                  {repo.index_status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">{repo.root_path}</TableCell>
              <TableCell>
                <Button size="sm" variant="ghost" onClick={() => selectRepo(repo.id)}>
                  Explore
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

### React Router v7 setup

```typescript
// apps/dashboard/src/router.tsx
import { createBrowserRouter } from "react-router";
import { RepoDetailPage } from "./pages/RepoDetailPage.js";
import { ReposPage } from "./pages/ReposPage.js";
import { TracesPage } from "./pages/TracesPage.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <TracesPage />,
  },
  {
    path: "/repos",
    element: <ReposPage />,
  },
  {
    path: "/repos/:repoId",
    element: <RepoDetailPage />,
  },
]);
```

### getTraceStore() singleton (addition to @lens/core)

```typescript
// packages/core/src/trace-store.ts — addition
let _instance: TraceStore | undefined;

export function createTraceStore(dbPath: string, retentionMs?: number): TraceStore {
  _instance = new TraceStore(dbPath, retentionMs);
  return _instance;
}

export function getTraceStore(): TraceStore {
  if (!_instance) throw new Error("TraceStore not initialized. Call createTraceStore() first.");
  return _instance;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-router-dom import | react-router (single package) | v7 (2024) | No react-router-dom needed; import everything from "react-router" |
| Tailwind config file (tailwind.config.ts) | @tailwindcss/vite plugin, no config file | Tailwind v4 (2025) | Simpler setup; @import "tailwindcss" in CSS |
| useQuery(key, fn) positional args | useQuery({ queryKey, queryFn }) single object | TanStack Query v5 (2024) | Cleaner TypeScript inference; no overload confusion |
| cacheTime (TanStack Query v4) | gcTime (v5) | TanStack Query v5 (2024) | Rename only; same behavior |
| isLoading (always false for cached data) | isPending (true only for no-data initial load) | TanStack Query v5 (2024) | Fixes misleading state in cached queries |
| shadcn style: "default" | shadcn style: "new-york" | shadcn 2024 | "default" still works but "new-york" is now the primary style |

**Deprecated/outdated:**
- `react-router-dom`: removed in v7 — do not install, all imports from `react-router`
- `tailwind.config.ts` with `content: [...]`: v4 drops this — use `@tailwindcss/vite`
- `useQuery(queryKey, queryFn, options)` three-arg form: removed in v5 — use single object

---

## Open Questions

1. **TraceStore getTraceStore() singleton — module coupling**
   - What we know: The `/traces` route in the daemon needs to query traces. TraceStore is initialized in `apps/daemon/src/index.ts`. Routes import from `@lens/core`.
   - What's unclear: Whether to add `getTraceStore()` to `@lens/core` (adds statefulness to core) or pass the store instance via Hono's context variable (`c.var`).
   - Recommendation: Add `getTraceStore()` to `@lens/core` — it follows the existing `getEngineDb()` / `configureLensRoute()` singleton pattern exactly. Hono context variable approach adds boilerplate. This is a local-first single-process daemon, not a distributed system.

2. **Dashboard build integration with daemon**
   - What we know: Dashboard must be built before daemon can serve it. The build output path must match what daemon's `serveStatic` expects.
   - What's unclear: Whether to use a post-build copy script or configure `vite.config.ts` `outDir` to write directly to a location the daemon can find.
   - Recommendation: Set `build.outDir` in `apps/dashboard/vite.config.ts` to `../daemon/public/dashboard` (relative to dashboard src). Daemon serves from `./public/dashboard`. Avoids copy scripts. Alternatively: use env var `LENS_DASHBOARD_DIST` for flexibility.

3. **lens grep `--repo` default to cwd**
   - What we know: The spec says "lens grep" should work; the user must pass a repo path. The CLI currently uses `process.cwd()` as a default.
   - What's unclear: If cwd is not a registered repo, the error message from daemon is helpful (`"Repo not registered"`), but could confuse users who don't understand they need to register first.
   - Recommendation: In `grep` command, if the daemon returns 404, print: `Repo not registered. Run: lens register ${repoPath}`. This surface the correct action.

4. **File list endpoint for repo explorer**
   - What we know: DASH-03 requires a repo file explorer with metadata (co-change score, hub status, import count). The engine has this data in `file_metadata` and `file_imports` tables.
   - What's unclear: Whether `GET /repos/:id/files` needs to be added to the daemon in Phase 3, or whether a simpler approach (streaming data from /grep results) would suffice for the explorer.
   - Recommendation: Add `GET /repos/:id/files` to daemon routes. It reads `file_metadata` JOIN `file_imports` (indegree) JOIN `file_stats` (commit_count). This is a simple SQL query and provides all data DASH-03 needs.

---

## Sources

### Primary (HIGH confidence)
- `apps/daemon/src/http.ts`, `apps/daemon/src/routes/*.ts` — current daemon structure; confirmed serveStatic is the correct approach for static serving
- `packages/core/src/trace-store.ts` — confirmed TraceStore schema and methods; identified missing `queryTraces`/`querySpans` methods
- `packages/core/src/index.ts` — confirmed exports; `getTraceStore()` not yet exported
- `packages/cli/src/index.ts` — confirmed citty is wired; `status` subcommand pattern to replicate
- npm registry (live queries 2026-02-20): `@tanstack/react-query@5.90.21`, `@tanstack/react-store@0.9.1`, `vite@7.3.1`, `react@19.2.4`, `shadcn@3.8.5`, `react-router@7.13.0`, `citty@0.2.1`, `kleur@4.1.5`, `picocolors@1.1.1`
- `https://hono.dev/docs/getting-started/nodejs` — serveStatic import, SPA fallback pattern
- `https://github.com/TanStack/store/blob/main/docs/framework/react/quick-start.md` — `createStore`, `useStore` with selector, `setState`
- `https://ui.shadcn.com/docs/components-json` — components.json structure for Vite + React + TypeScript

### Secondary (MEDIUM confidence)
- TanStack Query v5 useQuery pattern — confirmed via WebSearch against official docs (single-object arg, `isPending`, `gcTime`)
- shadcn Tailwind v4 integration — confirmed via WebSearch; `@tailwindcss/vite` plugin replaces postcss config
- react-router v7 import consolidation — confirmed via WebSearch; `react-router` only, no `react-router-dom`
- Hono SPA fallback: `app.use('*', serveStatic({ path: './index.html' }))` — confirmed via Hono Node.js docs

### Tertiary (LOW confidence — flagged for validation)
- Dashboard build `outDir` strategy (writing directly to `apps/daemon/public/`) — logical but not verified against actual pnpm workspace build sequencing; test during implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack (versions): HIGH — npm registry queries on 2026-02-20; all versions current
- CLI pattern (citty): HIGH — existing `status` command in codebase is the template; citty API verified
- TanStack Query v5 API: HIGH — official docs confirmed; v5 breaking changes well documented
- TanStack Store API: HIGH — official quick start guide read directly; `createStore`/`useStore` API stable at v0.9.1
- Hono serveStatic SPA pattern: HIGH — Node.js docs + community discussions confirm two-middleware pattern
- Trace waterfall component design: MEDIUM — CSS bars approach is proven (same as Jaeger/Zipkin) but no existing implementation to copy from; straightforward to build
- TraceStore query methods (missing gap): HIGH — confirmed by reading `trace-store.ts` source; methods are absent and must be added

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 — stable stack (TanStack Query/Store versioned libs, citty stable; shadcn/Tailwind v4 are current; re-verify if shadcn releases a major update)
