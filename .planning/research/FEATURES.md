# Feature Research

**Domain:** Code intelligence engine / structured code query tool
**Researched:** 2026-02-19
**Confidence:** HIGH (multiple competitors analyzed, v1 implementation validated core signals)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **File indexing with incremental updates** | Every code intelligence tool indexes; re-indexing from scratch on each change is unacceptable. Users expect sub-second updates on save. | MEDIUM | v1 had diff-based incremental indexing via `diffScan`. Must detect changed files from git and only re-process those. |
| **Import/dependency graph construction** | Sourcetrail, CodeSee, dependency-cruiser all build this. It's the foundational data structure for any "code is a graph" tool. | HIGH | Must resolve relative imports, aliases, barrel files. v1 handled JS/TS. Multi-language adds significant complexity. |
| **Symbol search / go-to-definition** | Sourcetrail's #1 feature. VS Code, JetBrains all have it. Users expect to search for a function name and find it. | MEDIUM | AST-based extraction of exports, classes, functions. v1 stored `exports` and `internals` in FileMetadata. |
| **Reverse dependency lookup ("who imports this?")** | Sourcetrail, Sourcegraph, CodeSee all provide this. Essential for impact analysis — "if I change this file, what breaks?" | LOW | Direct query on import graph edges. v1 had `getReverseImports`. Trivial once import graph exists. |
| **Git history integration** | CodeScene built an entire product on git log analysis. Developers expect commit counts, last-modified dates, authorship. | MEDIUM | v1 had `analyzeGitHistory` parsing git log. Core data for co-change, hotspot, and churn calculations. |
| **CLI interface** | Every developer tool has a CLI. Sourcegraph, dependency-cruiser, ast-grep all CLI-first. | LOW | Thin shell calling daemon HTTP. v1 already had this pattern. |
| **MCP server for AI agents** | MCP is the 2025 de-facto standard. Sourcegraph, ast-grep, CodeGraphContext all ship MCP servers. AI agents are primary consumers. | MEDIUM | v1 had 4 MCP tools (get_context, list_repos, get_status, index_repo). Must expose structured JSON, not just text. |
| **Structured logging** | Table stakes for any developer tool. Unstructured console.log is unacceptable for debugging daemon issues. | LOW | Core package provides Logger. v1 used structured request_logs table. |
| **Multi-repo support** | Developers work across repos. Sourcegraph is cross-repo by default. Single-repo-only is a dealbreaker for monorepo/polyrepo setups. | LOW | v1 had repo registration and per-repo isolation. Architecture already supports this. |

### Differentiators (Competitive Advantage)

Features that set LENS apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Co-change analysis from git history** | CodeScene charges $$$$ for this. No free/OSS tool does it well. Surfaces files that always change together — reveals hidden coupling that import graphs miss. | MEDIUM | v1 proved this works: parse git log, count co-committed file pairs. Key insight: co-change finds coupling that static analysis cannot. |
| **Hub file detection** | Identifies "god files" — high-indegree nodes in the import graph that many files depend on. No OSS tool surfaces this automatically. CodeScene's hotspot analysis is closest but is commercial. | LOW | Computed from import graph indegree + git churn. v1 had `getIndegrees`. Cheap to compute, high signal. |
| **Auto-tracing with `lensFn()`/`lensRoute()`** | Inspired by Encore.ts auto-instrumentation. Every engine function and HTTP route automatically traced with duration, spans, errors. No manual instrumentation. Unique: applied to code intelligence, not just web services. | MEDIUM | Core framework primitive. Wraps functions transparently. Encore.ts proved this UX pattern works — developers love zero-config observability. |
| **Trace waterfall viewer** | Visual debugging of how queries execute: what functions ran, how long each took, where errors occurred. Encore.ts's dev dashboard has this for HTTP requests; LENS applies it to code intelligence queries. | HIGH | Requires: trace data collection (lensFn), storage (TraceStore/SQLite), React dashboard component. High frontend effort but massive debugging value. |
| **Deterministic, reproducible results** | No embeddings, no LLM, no vector DB. Same query on same commit = same result, always. Greptile, Qodo, Sourcegraph Cody all use LLM/embeddings — non-deterministic by design. LENS is the opposite: auditable, debuggable, explainable. | LOW | This is an architectural choice, not a feature to build. Maintained by NOT adding embeddings/LLM to the ranking pipeline. |
| **Context-aware grep (`lens grep`)** | Regular grep returns matches. `lens grep` returns matches + import graph context (what imports the matched file, what it imports, co-change partners). No tool does this. | MEDIUM | Combines text search with graph enrichment. Killer feature for AI agents: they grep, then get structural context without a second query. |
| **Focus mode in dashboard** | Click a file/symbol, see only its neighborhood: direct imports, reverse imports, co-change partners, hub status. Sourcetrail had this for symbols. LENS does it for files with git signals. | MEDIUM | Subgraph extraction from import graph + co-change data. Frontend rendering with interactive graph (d3/react-flow). |
| **Dual consumer design (JSON for agents, visual for humans)** | Same engine serves both AI agents (MCP/JSON) and human developers (dashboard). Sourcegraph Cody is AI-only in practice; CodeSee was human-only. LENS serves both from one index. | LOW | Architectural decision. Daemon serves JSON API (for CLI/MCP) and static dashboard (for browser). Already designed this way. |
| **Query kind classification** | Automatically classifies queries as stack_trace, error_message, symbol, or natural language — then applies different ranking strategies. No competitor does this. | LOW | v1 had `parseQuery` with regex-based classification. Cheap, high-value signal for ranking. |
| **Vocab cluster analysis** | Groups files by shared vocabulary (TF-IDF over identifiers). Surfaces "these files talk about the same domain" without requiring explicit module boundaries. Unique to LENS. | MEDIUM | v1 implemented agglomerative clustering over file vocabulary. Novel signal — no competitor uses this approach. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Embedding-based semantic search** | "Find conceptually similar code" sounds great. Greptile, Qodo, Sourcegraph Cody all use it. | Destroys determinism — same query can return different results after re-embedding. Requires vector DB (infra overhead). Embedding quality varies by model/version. Results are unexplainable ("why did this file rank #3?"). v1 had optional embeddings; the structural signals alone performed well in benchmarks. | TF-IDF scoring + import graph + co-change signals. Deterministic, explainable, no external dependencies. |
| **Real-time file watching with instant re-index** | "Index should always be current." | File watchers are platform-dependent, resource-intensive, and fragile (FSEvents limits on macOS, inotify limits on Linux). Creates race conditions with rapid saves. | Index on explicit trigger (CLI command, MCP call) or on query if stale (check HEAD commit vs last-indexed commit). v1's `ensureIndexed` pattern works: re-index when stale, not continuously. |
| **Multi-language AST parsing** | "Support Python, Go, Rust, Java..." | Each language requires a separate parser with different semantics. Import resolution is language-specific. 80%+ of initial users will be JS/TS. Spreading across languages delays the core product. | JS/TS first (largest audience, v1 proven). Add languages one at a time based on demand. Use tree-sitter for parsing when expanding — consistent API across languages. |
| **Cloud-hosted indexing service** | "Index once, share across team." | Requires authentication, multi-tenancy, storage, billing. Massively increases scope. LENS's value is local-first, instant, private. | Keep local-only. Users index on their machine. No network dependency, no privacy concerns. Team sharing via committed config files. |
| **PR review / change impact visualization** | CodeSee's headline feature. "Show what this PR affects." | Requires GitHub/GitLab integration, webhook infrastructure, PR-level indexing. High complexity for a feature that duplicates what `git diff` + impact analysis can provide locally. | Provide `lens impact <file>` CLI command that shows what depends on a changed file. Same data, no integration overhead. |
| **AI-generated code summaries / explanations** | Qodo and Greptile do this. "Explain this function." | Requires LLM API calls (cost, latency, non-determinism). Summaries can be wrong. Contradicts deterministic/explainable positioning. | Expose raw structural data (purpose field from metadata extraction, export lists, import chains). Let the consuming AI agent do its own summarization with full context. |
| **IDE plugin / VS Code extension** | "I want this in my editor." | IDE extensions are a separate product: different API, different lifecycle, different debugging. High maintenance for each IDE version. | MCP integration gives IDE-level access via Cursor, Claude Code, Windsurf, etc. CLI works from any terminal inside any IDE. Dashboard is browser-based, works alongside any editor. |

## Feature Dependencies

```
[Import Graph Construction]
    |
    +--requires--> [File Indexing]
    |                  |
    |                  +--requires--> [File Discovery (fullScan/diffScan)]
    |
    +--enables--> [Reverse Dependency Lookup]
    +--enables--> [Hub File Detection]
    +--enables--> [Focus Mode (dashboard)]
    +--enables--> [Context-Aware Grep]

[Git History Analysis]
    |
    +--requires--> [Repo Registration]
    |
    +--enables--> [Co-Change Analysis]
    +--enables--> [Hub File Detection] (churn component)
    +--enables--> [File Stats (commit count, recency)]

[lensFn() / Auto-Tracing]
    |
    +--requires--> [Core Package: Logger, TraceStore]
    |
    +--enables--> [Trace Waterfall Viewer]
    +--enables--> [Performance Debugging]

[Trace Waterfall Viewer]
    |
    +--requires--> [lensFn() tracing]
    +--requires--> [TraceStore (SQLite)]
    +--requires--> [Dashboard (React SPA)]

[MCP Server]
    |
    +--requires--> [Daemon HTTP Server]
    +--requires--> [Engine (all intelligence functions)]

[Dashboard]
    |
    +--requires--> [Daemon serving static files + JSON API]
    +--enhances--> [Trace Waterfall Viewer]
    +--enhances--> [Focus Mode]
    +--enhances--> [Repo Explorer]

[Context-Aware Grep]
    |
    +--requires--> [Import Graph]
    +--requires--> [Co-Change Analysis]
    +--enhances--> [MCP get_context tool]

[Query Kind Classification]
    |
    +--enhances--> [Context Building / Ranking]
    +--no hard deps (standalone parser)]

[Vocab Clusters]
    |
    +--requires--> [File Indexing + Metadata Extraction]
    +--enhances--> [Context Building / Ranking]
```

### Dependency Notes

- **Import Graph requires File Indexing:** Cannot build edges without first discovering and parsing files.
- **Hub Detection requires both Import Graph AND Git History:** Indegree from graph + churn from git = hub score.
- **Trace Waterfall requires lensFn + Dashboard:** All three layers (tracing, storage, visualization) must exist.
- **Focus Mode requires Import Graph + Dashboard:** Subgraph extraction from graph data, rendered in browser.
- **Co-Change requires Git History:** Parses `git log` to find co-committed file pairs.
- **MCP and CLI require Daemon:** Both are thin clients calling daemon HTTP endpoints.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] **Core framework (lensFn, lensRoute, Logger, TraceStore)** — foundation everything builds on
- [ ] **File discovery and incremental indexing** — must detect changes efficiently via git
- [ ] **Import graph construction (JS/TS)** — core data structure for all graph queries
- [ ] **Git history analysis (co-change, file stats)** — differentiating signal
- [ ] **Hub file detection** — cheap to compute once graph + git exist, high-value output
- [ ] **Context builder with multi-signal ranking** — combines graph + git + TF-IDF into ranked results
- [ ] **Daemon HTTP server** — serves API, MCP, and dashboard
- [ ] **MCP server (get_context, list_repos, get_status, index_repo)** — primary AI agent interface
- [ ] **CLI (register, context, status, index)** — primary human interface

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **Dashboard SPA (repo explorer, basic stats)** — trigger: "I want to see what LENS knows" requests
- [ ] **Trace waterfall viewer** — trigger: debugging query performance / understanding why a file ranked high
- [ ] **Context-aware grep (`lens grep`)** — trigger: AI agents requesting grep + context in one call
- [ ] **Focus mode in dashboard** — trigger: dashboard exists, users want to explore specific file neighborhoods
- [ ] **Query kind classification** — trigger: different query types need different ranking strategies
- [ ] **Vocab cluster analysis** — trigger: co-change alone doesn't explain domain groupings

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Additional language support (Python, Go, Rust)** — defer until JS/TS audience validated
- [ ] **Architecture boundary enforcement (like Tach)** — defer: different product category
- [ ] **CI/CD integration (fail build on circular deps)** — defer: requires language-specific maturity
- [ ] **Graph diff (how did the dependency graph change between commits)** — defer: niche, high complexity

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Core framework (lensFn, Logger, TraceStore) | HIGH | MEDIUM | P1 |
| File indexing (incremental) | HIGH | MEDIUM | P1 |
| Import graph (JS/TS) | HIGH | HIGH | P1 |
| Git history analysis | HIGH | MEDIUM | P1 |
| Co-change analysis | HIGH | LOW | P1 |
| Hub file detection | MEDIUM | LOW | P1 |
| Context builder (ranking) | HIGH | HIGH | P1 |
| Daemon HTTP server | HIGH | LOW | P1 |
| MCP server (4 tools) | HIGH | MEDIUM | P1 |
| CLI (core commands) | MEDIUM | LOW | P1 |
| Dashboard (basic) | MEDIUM | HIGH | P2 |
| Trace waterfall | MEDIUM | HIGH | P2 |
| Context-aware grep | HIGH | MEDIUM | P2 |
| Focus mode | MEDIUM | MEDIUM | P2 |
| Query kind classification | MEDIUM | LOW | P2 |
| Vocab clusters | LOW | MEDIUM | P3 |
| Multi-language parsing | MEDIUM | HIGH | P3 |
| Architecture enforcement | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Sourcetrail (dead) | CodeSee (dead) | Sourcegraph | CodeScene | Greptile | Qodo | LENS Approach |
|---------|-------------------|----------------|-------------|-----------|----------|------|---------------|
| Symbol graph / navigation | Core feature (interactive graph + code) | Codebase maps (directory-level) | Code navigation (go-to-def, find-refs) | N/A (not a navigation tool) | N/A (review-focused) | Cross-repo context | Import graph + file-level metadata. Not symbol-level initially — file-level is sufficient for AI agents. |
| Import/dependency visualization | Incoming/outgoing deps per symbol | Upstream/downstream dependency maps | Cross-repo dependency search | Change coupling across repos | N/A | Dependency analysis | Import graph with forward + reverse edges, rendered in dashboard focus mode. |
| Co-change / temporal coupling | No | No | No | Core feature ($$$) | No | Commit history analysis | Core differentiator. Free/OSS co-change analysis from git log. CodeScene charges thousands/year for this. |
| Hub / hotspot detection | No | No | No | Hotspot analysis (complexity + churn) | No | Issue finder | Hub = high indegree + high churn. Simpler than CodeScene's 25-factor score, but captures the key signal. |
| AI agent integration (MCP) | No (pre-MCP era) | No (pre-MCP era) | Yes (MCP server) | No | REST API | MCP server | MCP server as primary interface. JSON output, not text blobs. |
| Deterministic results | Yes (static analysis) | Yes (static analysis) | Search: yes. Cody: no (LLM) | Yes (behavioral analysis) | No (LLM) | No (LLM + RAG) | Yes, always. Core positioning. |
| Auto-tracing / observability | No | No | No | No | No | No | Unique via lensFn/lensRoute. No competitor offers observability into the code intelligence engine itself. |
| Visual dashboard | Graph + code viewer (desktop app) | Maps (web app) | Web search UI | Web dashboard | GitHub PR comments | Web dashboard | Vite + React SPA. Trace waterfall, repo explorer, focus mode. |
| Local-first / offline | Yes (desktop app) | No (cloud) | No (server) | No (cloud/on-prem) | No (cloud) | No (cloud) | Yes. SQLite, runs on developer machine. No network required. |
| Open source | Yes (GPLv3, archived) | No | Partially (search: yes, Cody: yes) | No | No | No | Yes. |

## Sources

- Sourcetrail documentation and feature analysis: [GitHub DOCUMENTATION.md](https://github.com/CoatiSoftware/Sourcetrail/blob/master/DOCUMENTATION.md), [DeepWiki](https://deepwiki.com/CoatiSoftware/Sourcetrail)
- CodeSee product pages: [codesee.io](https://www.codesee.io), [Codebase Maps](https://www.codesee.io/codebase-maps), [Code Reviews](https://www.codesee.io/code-reviews)
- Sourcegraph MCP and code intelligence: [sourcegraph.com](https://sourcegraph.com/), [Sourcegraph MCP (PulseMCP)](https://www.pulsemcp.com/servers/divar-sourcegraph)
- CodeScene behavioral analysis and change coupling: [codescene.com](https://codescene.com/product/behavioral-code-analysis), [Change Coupling Docs](https://codescene.io/docs/guides/technical/change-coupling.html)
- Greptile code intelligence API: [greptile.com](https://www.greptile.com), [Greptile 2.0](https://www.greptile.com/blog/greptile-2)
- Qodo Context Engine: [qodo.ai](https://www.qodo.ai/blog/introducing-qodo-aware-deep-codebase-intelligence-for-enterprise-development/), [MCP Docs](https://docs.qodo.ai/qodo-documentation/qodo-aware/usage/mcp-usage)
- Encore.ts observability: [Tracing docs](https://encore.dev/docs/ts/observability/tracing), [Dev Dashboard docs](https://encore.dev/docs/ts/observability/dev-dash)
- dependency-cruiser: [GitHub](https://github.com/sverweij/dependency-cruiser), [npm](https://www.npmjs.com/package/dependency-cruiser)
- Tach architecture enforcement: [GitHub](https://github.com/tach-org/tach), [Docs](https://docs.gauge.sh/)
- ast-grep MCP: [GitHub](https://github.com/ast-grep/ast-grep-mcp)
- CodeGraphContext: [GitHub](https://github.com/CodeGraphContext/CodeGraphContext)
- Evil Martians on developer tool trust: [6 things developer tools must have in 2026](https://evilmartians.com/chronicles/six-things-developer-tools-must-have-to-earn-trust-and-adoption)
- MCP ecosystem overview: [a16z deep dive](https://a16z.com/a-deep-dive-into-mcp-and-the-future-of-ai-tooling/), [Pento year in review](https://www.pento.ai/blog/a-year-of-mcp-2025-review)

---
*Feature research for: Code intelligence engine / structured code query tool*
*Researched: 2026-02-19*
