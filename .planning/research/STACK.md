# Stack Research

**Domain:** Local-first structured code query engine with built-in observability
**Researched:** 2026-02-19
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | ^5.9.0 | Language | Current stable. TS 6.0 beta is out but not stable yet. 5.9 is production-ready with full ESM support. |
| Node.js | >=22 | Runtime | LTS with native `node:sqlite` (experimental), native fetch, stable ESM. Required by better-sqlite3 12.x. |
| pnpm | ^10.30 | Package manager | Workspace protocol (`workspace:*`), strict node_modules, `onlyBuiltDependencies` for native addons. |
| Hono | ^4.11 | HTTP framework | 14KB, Web Standards API, middleware ecosystem, built-in OpenAPI. Faster than Express, lighter than Fastify. Runs on Node via `@hono/node-server`. |
| @hono/node-server | ^1.19 | Node.js adapter for Hono | Bridges Hono's Web Standard Request/Response to Node.js HTTP. Required for local daemon. |
| better-sqlite3 | ^12.6 | SQLite driver | Synchronous, 10x faster than sql.js, native addon. Powers TraceStore and all local persistence. |
| Drizzle ORM | ^0.45 | SQL query builder / ORM | Type-safe, zero overhead, native better-sqlite3 driver. Schema-as-code, auto-migrations via drizzle-kit. |
| @modelcontextprotocol/sdk | ^1.26 | MCP server | Official SDK. `server.registerTool()` API. v2 expected Q1 2026 but v1.x is production-ready. |
| Zod | ^4.3 | Schema validation | Runtime type validation, MCP SDK input schemas, Hono request validation. v4 is stable, faster, slimmer than v3. |

### Dashboard Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vite | ^7.3 | Build tool / dev server | Fast HMR, native ESM, Rolldown bundler (Rust-based, replaces esbuild+Rollup). Standard for React SPAs. |
| React | ^19.2 | UI framework | Current stable (19.2.4). Server Components not needed for local SPA. |
| react-router | ^7.13 | Client-side routing | v7 is the Remix merger. For SPA use, just the client routing features. |
| @tanstack/react-query | ^5.90 | Server state | Caching, deduplication, background refetch for daemon API calls. |
| @tanstack/store | ^0.10 | Client state | Lightweight reactive store for UI-only state (filters, selections). No Redux/Zustand overhead. |
| Tailwind CSS | ^4.1 | Utility CSS | v4 CSS-first config (no tailwind.config.js), Oxide engine, 5x faster builds. |
| shadcn/ui | latest | Component library | Copy-paste Radix primitives with Tailwind. Feb 2026: unified `radix-ui` package, RTL support. Not an npm dep -- CLI scaffolds components into project. |
| Recharts | ^3.7 | Charts / visualization | React + D3, SVG-based. For trace waterfall, graph viz, scoring heatmaps. |

### Code Intelligence Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ts-morph | ^27.0 | TypeScript AST analysis | Import graph extraction, call graph analysis, symbol resolution. Wraps TS Compiler API. |
| simple-git | ^3.30 | Git operations | Co-change analysis, git log parsing, blame data. Async wrapper over git CLI. |
| chokidar | ^5.0 | File watching | Incremental re-indexing on file changes. ESM-only v5, Node >=20. |

### Development Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| tsup | ^8.5 | Package bundler | ESM+CJS dual output, esbuild-powered. Used for `core`, `engine`, `cli`, `daemon`. |
| Biome | ^2.4 | Lint + format | Rust-based, replaces ESLint+Prettier. v2.4 has type-aware rules, CSS/GraphQL in TS files. |
| Vitest | ^4.0 | Testing | Vite-native, browser mode stable, Playwright trace support. |
| drizzle-kit | ^0.45 | Migration tool | Auto-generates SQL migrations from Drizzle schema. Paired with drizzle-orm. |

## Installation

```bash
# Root devDependencies
pnpm add -Dw typescript@^5.9 @biomejs/biome@^2.4 tsup@^8.5 vitest@^4.0

# packages/core
pnpm --filter @lens/core add better-sqlite3@^12.6 zod@^4.3
pnpm --filter @lens/core add -D @types/better-sqlite3 drizzle-kit

# packages/engine
pnpm --filter @lens/engine add @lens/core ts-morph@^27.0 simple-git@^3.30 chokidar@^5.0

# packages/cli
pnpm --filter @lens/cli add citty@^0.2

# apps/daemon
pnpm --filter @lens/daemon add @lens/core @lens/engine hono@^4.11 @hono/node-server@^1.19 @modelcontextprotocol/sdk@^1.26 zod@^4.3 drizzle-orm@^0.45

# apps/dashboard
pnpm --filter @lens/dashboard add react@^19.2 react-dom@^19.2 react-router@^7.13 @tanstack/react-query@^5.90 @tanstack/react-store@^0.10 recharts@^3.7
pnpm --filter @lens/dashboard add -D vite@^7.3 @vitejs/plugin-react tailwindcss@^4.1
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| better-sqlite3 | node:sqlite (built-in) | When it exits experimental status. Currently lacks extensions, custom builds, WAL control. Not production-ready. |
| better-sqlite3 | sql.js | Never for local daemon. sql.js is WASM-based, 10x slower. Only useful for browser/Cloudflare Workers. |
| Drizzle ORM | Prisma | If you need managed migrations with rollback. But Prisma has heavy runtime, code generation step, slower queries. Drizzle is SQL-in-TS with zero overhead. |
| Drizzle ORM | Kysely | If you want raw query builder without ORM features. But Drizzle gives you both query builder AND schema/migration tools. |
| Hono | Fastify | If you need mature plugin ecosystem (auth, rate-limit plugins). But Hono is lighter, Web Standards based, and we don't need server-heavy plugins for a local daemon. |
| Hono | Express | Never. Express 5 is out but still callback-based, no native async, heavier. |
| ts-morph | oxc-parser (Rust) | For parse-only AST extraction at massive scale. But ts-morph gives full TypeScript type resolution, symbol lookup, import tracing -- all needed for code intelligence. oxc-parser is parse-only, no type checking. |
| ts-morph | @swc/core | For fast transpilation. Not a replacement for code analysis -- SWC doesn't expose TypeScript type information. |
| citty | commander.js | If you need complex multi-level subcommands. But citty is lighter, typed, lazy-loaded subcommands. Perfect for thin CLI that just calls HTTP. |
| citty | clipanion | If you prefer class-based command definitions (yarn's approach). Heavier, more boilerplate. |
| Tailwind CSS v4 | CSS Modules | If you want scoped CSS without utility classes. But shadcn/ui requires Tailwind, and Tailwind v4 is zero-config. |
| @tanstack/store | Zustand | If you want middleware (devtools, persist). But TanStack Store is lighter and we already use TanStack Query. Keeps ecosystem consistent. |
| @tanstack/store | Jotai | If you want atomic state. Similar weight, but TanStack Store integrates naturally with TanStack Query. |
| Recharts | Nivo | If you need more chart types (waffle, radar). But Recharts covers our needs (line, bar, treemap, area) and is simpler. |
| Vitest | Jest | Never. Vitest is Vite-native, faster, ESM-first. Jest has ESM issues and heavier config. |
| Biome v2 | ESLint + Prettier | If you need niche ESLint plugins. But Biome replaces both tools, is 10-100x faster (Rust), and v2 has type-aware rules. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Encore.ts | Cloud-only hosting model, closed source runtime, vendor lock-in. Good for inspiration but not for local-first. | Hono + custom `lensFn()` / `lensRoute()` tracing wrappers |
| OpenTelemetry SDK | Massive dependency tree (50+ packages), designed for distributed systems. Overkill for single-process local daemon. | Custom TraceStore (SQLite) with `lensFn()` spans |
| Prisma | Heavy runtime (~7MB), requires code generation step (`prisma generate`), slower queries than Drizzle, poor monorepo support. | Drizzle ORM |
| Express | Legacy callback model, no native async/await support, 3x heavier than Hono. | Hono |
| Webpack | Slow, complex config. Vite has won. | Vite |
| ESLint + Prettier | Two tools, slower, complex config, ESM/CJS plugin issues. | Biome v2 |
| sql.js | WASM overhead, 10x slower than native SQLite for local use. | better-sqlite3 |
| node:sqlite | Still experimental, no extensions, can't configure WAL mode, no prepared statements cache. | better-sqlite3 (revisit when node:sqlite is stable) |
| Redux / Redux Toolkit | Massive boilerplate for simple UI state. | @tanstack/store for client state, @tanstack/react-query for server state |
| next.js / remix SSR | Full SSR framework overhead for what is a local SPA served by daemon. No SEO needed. | Vite + React SPA |
| Tree-sitter WASM | Good for multi-language parsing but TS-only project doesn't need it. tree-sitter-typescript lags behind ts-morph for type resolution. | ts-morph for full TS type system access |

## Stack Patterns by Variant

**If adding multi-language support later (Python, Go, Rust):**
- Add tree-sitter with language-specific grammars
- ts-morph stays for TypeScript, tree-sitter for others
- Because: ts-morph gives full type resolution for TS; tree-sitter gives syntax-level parsing for others

**If MCP SDK v2 ships before implementation:**
- Upgrade `@modelcontextprotocol/sdk` to ^2.0
- API may change from `server.registerTool()` -- check migration guide
- Because: v2 promises streamable HTTP transport, better auth

**If node:sqlite becomes stable (Node 24+):**
- Evaluate replacing better-sqlite3
- Check: WAL mode, prepared statements, extension loading
- Because: Zero native addon = simpler install, no `pnpm approve-builds`

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| drizzle-orm@^0.45 | better-sqlite3@^12.6 | Native driver via `drizzle-orm/better-sqlite3`. Import: `import { drizzle } from 'drizzle-orm/better-sqlite3'` |
| drizzle-kit@^0.45 | drizzle-orm@^0.45 | Must match major.minor with drizzle-orm |
| Hono@^4.11 | @hono/node-server@^1.19 | Hono 4.x requires node-server 1.x |
| Vite@^7.3 | React@^19.2 | Via `@vitejs/plugin-react` |
| Vite@^7.3 | Vitest@^4.0 | Both use Rolldown under the hood |
| Tailwind@^4.1 | Vite@^7.3 | Via `@tailwindcss/vite` plugin (no PostCSS needed) |
| shadcn/ui | Tailwind@^4.1, React@^19.2 | Uses unified `radix-ui` package since Feb 2026 |
| @tanstack/react-query@^5.90 | React@^19.2 | Peer dependency on React 18+ |
| @tanstack/react-store@^0.10 | React@^19.2 | Via `@tanstack/react-store` adapter |
| ts-morph@^27.0 | TypeScript@^5.9 | Bundles its own TS compiler. Pin if needed. |
| Biome@^2.4 | TypeScript@^5.9 | Type-aware rules require tsconfig. Configure `types` domain in biome.json. |
| Zod@^4.3 | @modelcontextprotocol/sdk@^1.26 | MCP SDK uses Zod for tool input schemas. Ensure both on Zod 4. |
| pnpm@^10.30 | Node@>=22 | pnpm 10.x requires Node 20+. |

## Sources

- [hono - npm](https://www.npmjs.com/package/hono) -- v4.11.9, verified Feb 2026 (HIGH)
- [@hono/node-server - npm](https://www.npmjs.com/package/@hono/node-server) -- v1.19.9 (HIGH)
- [better-sqlite3 - npm](https://www.npmjs.com/package/better-sqlite3) -- v12.6.2, Jan 2026 (HIGH)
- [drizzle-orm - npm](https://www.npmjs.com/package/drizzle-orm) -- v0.45.1, v1.0.0-beta.2 available (HIGH)
- [@modelcontextprotocol/sdk - npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) -- v1.26.0, v2 expected Q1 2026 (HIGH)
- [Zod v4 release notes](https://zod.dev/v4) -- v4.3.6 (HIGH)
- [ts-morph - npm](https://www.npmjs.com/package/ts-morph) -- v27.0.2 (HIGH)
- [simple-git - npm](https://www.npmjs.com/package/simple-git) -- v3.30.0 (HIGH)
- [chokidar - npm](https://www.npmjs.com/package/chokidar) -- v5, ESM-only (HIGH)
- [Vite 7.0 announcement](https://vite.dev/blog/announcing-vite7) -- v7.3.1 (HIGH)
- [React versions](https://react.dev/versions) -- v19.2.4 (HIGH)
- [react-router - npm](https://www.npmjs.com/package/react-router) -- v7.13.0 (HIGH)
- [@tanstack/react-query - npm](https://www.npmjs.com/package/@tanstack/react-query) -- v5.90.21 (HIGH)
- [TanStack Store releases](https://github.com/TanStack/store/releases) -- v0.10.1 (MEDIUM)
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4) -- v4.1 (HIGH)
- [shadcn/ui changelog](https://ui.shadcn.com/docs/changelog) -- Feb 2026 unified radix-ui (HIGH)
- [Recharts - npm](https://www.npmjs.com/package/recharts) -- v3.7.0 (HIGH)
- [Biome v2.4](https://biomejs.dev/blog/biome-v2-1/) -- v2.4.2 (HIGH)
- [tsup - npm](https://www.npmjs.com/package/tsup) -- v8.5.1 (HIGH)
- [Vitest 4.0 announcement](https://vitest.dev/blog/vitest-4) -- v4.0.18 (HIGH)
- [citty - npm](https://www.npmjs.com/package/citty) -- v0.2.1 (MEDIUM)
- [pnpm 10.30 blog](https://pnpm.io/blog/releases/10.30) -- v10.30.0 (HIGH)
- [TypeScript releases](https://github.com/microsoft/typescript/releases) -- v5.9 stable, v6.0 beta (HIGH)
- [Node.js SQLite API](https://nodejs.org/api/sqlite.html) -- still experimental (HIGH)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) -- `server.registerTool()` is current API (HIGH)

---
*Stack research for: LENS v2 -- Structured Code Query Engine with Observability*
*Researched: 2026-02-19*
